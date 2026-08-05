'use server'

import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAdminSession, setAdminSessionCookie, clearAdminSessionCookie } from '@/lib/admin-auth/server'
import { ADMIN_MIN_PASSWORD_LENGTH } from '@/lib/admin-auth/constants'

// Server Actions do step-up da seção ADMIN (TES-3). Mensagens de erro
// seguem literalmente o SPEC (RN3: nunca revelar se o usuário existe ou
// se foi a senha que errou).
const ERRO_CREDENCIAL = 'Usuário ou senha inválidos.'
const ERRO_BLOQUEADO = 'Muitas tentativas. Tente novamente em alguns minutos.'

interface AdminActionResult {
  error: string | null
}

// Exige que o colaborador já esteja logado no portal e seja admin
// (profiles.role='admin') — modelo mais restritivo assumido pela
// Arquitetura (credencial ADMIN sozinha não basta). A senha em si nunca é
// verificada aqui: a RPC `admin_login` faz o bcrypt dentro do Postgres.
//
// SECURITY_REPORT.md CRIT-1: `admin_login`/`admin_trocar_senha` não têm
// mais `grant` para `authenticated` (migration 019) — só são chamáveis
// via `service_role`, depois que a validação de sessão do portal +
// `role='admin'` acima já passou. Isso mantém o gate de autorização e o
// gate de execução no mesmo lado (o servidor), em vez de confiar que
// nenhum chamador vai contornar o Next.js e falar direto com o PostgREST.
export async function adminLogin(username: string, senha: string): Promise<AdminActionResult> {
  const usernameTrim = username.trim()
  if (!usernameTrim || !senha) return { error: ERRO_CREDENCIAL }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: ERRO_CREDENCIAL }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    // CODE_REVIEW.md (low): sem isto, um erro de configuração do
    // service_role (env ausente) fica indistinguível de senha errada nos
    // logs — o retorno ao usuário continua genérico (RN3), só o log é
    // mais específico para quem opera o servidor.
    console.error('adminLogin: falha ao criar client service_role', e)
    return { error: ERRO_CREDENCIAL }
  }

  const { data, error } = await admin.rpc('admin_login', {
    p_username: usernameTrim,
    p_senha: senha,
  })
  if (error) return { error: ERRO_CREDENCIAL }

  const row = data?.[0]
  if (!row || row.status === 'invalid') return { error: ERRO_CREDENCIAL }
  if (row.status === 'locked') return { error: ERRO_BLOQUEADO }

  await setAdminSessionCookie({
    sub: row.id,
    username: row.username,
    mustChangePassword: row.trocar_senha,
  })
  return { error: null }
}

// Encerra apenas a sessão ts_admin (RN6/DP3) — a sessão do portal
// (Supabase Auth) continua ativa.
export async function adminLogout(): Promise<void> {
  await clearAdminSessionCookie()
  redirect('/admin/bloqueio')
}

// Troca obrigatória de senha do primeiro acesso (semente `ADMIN`, DP4) e
// trocas futuras. `p_id` vem sempre da sessão ts_admin já verificada no
// servidor — nunca de input do formulário.
export async function trocarSenhaInicial(
  senhaNova: string,
  senhaConfirmacao: string
): Promise<AdminActionResult> {
  if (senhaNova !== senhaConfirmacao) {
    return { error: 'As senhas não coincidem.' }
  }
  if (senhaNova.length < ADMIN_MIN_PASSWORD_LENGTH) {
    return { error: `A nova senha deve ter ao menos ${ADMIN_MIN_PASSWORD_LENGTH} caracteres.` }
  }

  const session = await getAdminSession()
  if (!session) redirect('/admin/bloqueio')

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('trocarSenhaInicial: falha ao criar client service_role', e)
    return { error: 'Não foi possível salvar a nova senha. Tente novamente.' }
  }

  const { data: ok, error } = await admin.rpc('admin_trocar_senha', {
    p_id: session.sub,
    p_senha_nova: senhaNova,
  })
  if (error || !ok) {
    return { error: 'Não foi possível salvar a nova senha. Tente novamente.' }
  }

  await setAdminSessionCookie({
    sub: session.sub,
    username: session.username,
    mustChangePassword: false,
    loginAt: session.loginAt,
  })
  return { error: null }
}
