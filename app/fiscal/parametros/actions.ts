'use server'

import { getAuthenticatedAdmin, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarEvento } from '@/lib/logs'

// SECURITY_REPORT.md ALTA-1 (histórico): `requireAdminSection()` só
// protegia a renderização das páginas de Parâmetros/Vínculos — nenhuma das
// Server Actions abaixo checava a sessão `ts_admin`, então alguém com a
// sessão do portal aberta (mas sem ter passado pela credencial ADMIN)
// conseguia executar qualquer uma delas direto via `Next-Action`, sem
// nunca ver a tela de bloqueio. A sessão `ts_admin` foi removida do
// portal; a proteção de cada action abaixo hoje é a checagem de
// `role === 'admin'` feita logo no início de cada função.

export async function salvarComunicado(formData: FormData) {
  // SECURITY_REPORT.md ALTA-2: esta action não checava `role='admin'`
  // (diferente de quase todas as outras deste arquivo), então qualquer
  // colaborador autenticado conseguia sobrescrever app_settings via
  // getAuthenticatedAdmin() (que devolve um cliente service_role sem
  // verificar o papel do chamador).
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) throw new Error('Não autorizado')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') throw new Error('Acesso negado.')

  const texto = formData.get('dashboard_announcement') as string
  const { error } = await supabase.from('app_settings').update({ dashboard_announcement: texto }).eq('id', 1)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}

export async function atualizarPerfil(id: string, formData: FormData) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) throw new Error('Não autorizado.')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') throw new Error('Acesso negado.')

  const setores = formData.getAll('setores') as string[]
  const paginasAcesso = formData.getAll('paginas_acesso') as string[]

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: formData.get('nome') as string,
      role: formData.get('role') as string,
      cor:  formData.get('cor')  as string,
      setores: setores.length > 0 ? setores : ['fiscal'],
      paginas_acesso: paginasAcesso,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}

export async function criarUsuario(payload: {
  nome: string
  login: string
  senha: string
  role: string
  cor: string
  paginasAcesso: string[]
  setores: string[]
}): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role, nome').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: payload.login,
    password: payload.senha,
    email_confirm: true,
  })
  if (authErr) return { error: authErr.message }

  const userId = authData.user.id

  // A trigger handle_new_user() já criou a linha em profiles (com valores
  // padrão) como parte da mesma transação do createUser acima — por isso
  // aqui é update, não insert.
  const { error: profErr } = await admin.from('profiles').update({
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setores: payload.setores.length > 0 ? payload.setores : ['fiscal'],
    paginas_acesso: payload.paginasAcesso,
  }).eq('id', userId)

  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { error: profErr.message }
  }

  // Log de Eventos: usuário não tem cliente nem setor — entra como item
  // "Usuário", no mesmo formato dos eventos gravados pelas triggers (058).
  await registrarEvento(admin, {
    setor: null, clienteId: null, clienteNome: null,
    tipoEvento: 'criacao',
    usuarioId: user.id, usuarioNome: callerProfile?.nome ?? 'Desconhecido',
    detalhes: { entidade: 'Usuário', descricao: payload.nome || payload.login },
  })

  revalidatePath('/fiscal/parametros')
  return {}
}

export async function deletarUsuario(id: string): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role, nome').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }
  if (id === user.id) return { error: 'Você não pode excluir seu próprio usuário.' }

  const admin = createAdminClient()
  // Nome lido antes de apagar (pro Log de Eventos): o cascade abaixo leva a
  // linha de profiles junto. Sem nome no perfil, cai pro e-mail do login.
  const { data: alvo } = await admin.from('profiles').select('nome').eq('id', id).maybeSingle()
  let descricaoAlvo = alvo?.nome || ''
  if (!descricaoAlvo) {
    const { data: alvoAuth } = await admin.auth.admin.getUserById(id)
    descricaoAlvo = alvoAuth?.user?.email || '—'
  }

  // profiles.id referencia auth.users on delete cascade — apagar o auth.user
  // já remove a linha em profiles junto.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }

  await registrarEvento(admin, {
    setor: null, clienteId: null, clienteNome: null,
    tipoEvento: 'exclusao',
    usuarioId: user.id, usuarioNome: callerProfile?.nome ?? 'Desconhecido',
    detalhes: { entidade: 'Usuário', descricao: descricaoAlvo },
  })

  revalidatePath('/fiscal/parametros')
  return {}
}

const CONFIGURACOES_EDITAVEIS = [
  'email_ativo', 'email_destinatario',
  'rotina1_ativo', 'rotina1_dia', 'rotina1_hora',
  'rotina2_ativo', 'rotina2_dia', 'rotina2_hora',
]

export async function salvarConfiguracoes(settings: Record<string, unknown>): Promise<{ error?: string }> {
  // SECURITY_REPORT.md ALTA-2: mesma lacuna de salvarComunicado — faltava
  // o check de `role='admin'`, e getAuthenticatedAdmin() sozinho devolve
  // service_role pra qualquer autenticado.
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  // Só o que a tela edita: o controle do envio agendado (rotinaN_ultimo_envio)
  // e qualquer outra coluna de app_settings ficam fora do alcance desta action.
  const permitidos = Object.fromEntries(Object.entries(settings).filter(([chave]) => CONFIGURACOES_EDITAVEIS.includes(chave)))
  if (Object.keys(permitidos).length === 0) return {}

  const { error } = await supabase.from('app_settings').update(permitidos).eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}
