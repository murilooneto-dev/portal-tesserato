import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_INACTIVITY_TTL_SECONDS } from './constants'
import { signAdminToken, verifyAdminToken, type AdminSessionPayload } from './session'

// Superfície Node do módulo de sessão ADMIN — usa `next/headers`, por isso
// só roda em Server Components/Server Actions (não no `proxy.ts`, que usa
// request/response diretamente com as funções de session.ts).

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: ADMIN_SESSION_INACTIVITY_TTL_SECONDS,
  }
}

// Lê e verifica a sessão ADMIN atual, sem redirecionar — para telas que
// precisam saber o estado (ex.: /admin/bloqueio decidindo entre o
// sub-estado "login" e "trocar-senha").
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null
  return verifyAdminToken(token)
}

// Guarda autoritativa para Server Components e Server Actions da seção
// ADMIN (RNF2/RN1/CA5) — chamar antes de qualquer query. Não escreve
// cookie (Server Components não podem; a renovação por inatividade é
// feita no proxy.ts a cada requisição). Redireciona para a tela de
// bloqueio se não houver sessão válida ou se a troca de senha obrigatória
// ainda não foi feita (trocar_senha=true na semente/DP4).
export async function requireAdminSection(nextPath?: string): Promise<AdminSessionPayload> {
  const session = await getAdminSession()
  const params = new URLSearchParams()
  if (nextPath) params.set('next', nextPath)

  if (!session) {
    redirect(`/admin/bloqueio${params.size ? `?${params.toString()}` : ''}`)
  }

  if (session.mustChangePassword) {
    params.set('etapa', 'trocar-senha')
    redirect(`/admin/bloqueio?${params.toString()}`)
  }

  return session
}

// SECURITY_REPORT.md ALTA-1: variante sem redirect, para Server Actions de
// escrita (não RSC de página) — `redirect()` joga fora o formato de
// retorno `{ error }` que essas actions já usam e navegaria a página
// inteira no meio de uma submissão. Retorna `null` se não houver sessão
// `ts_admin` válida ou se a troca de senha obrigatória ainda estiver
// pendente; quem chama decide como reportar (early-return `{ error }` ou
// `throw`, conforme o formato de retorno da action).
export async function getValidAdminSession(): Promise<AdminSessionPayload | null> {
  const session = await getAdminSession()
  if (!session || session.mustChangePassword) return null
  return session
}

// Emite/renova o cookie `ts_admin` após login bem-sucedido ou troca de
// senha. `loginAt` deve ser repassado nas renovações (nunca em um novo
// login) para preservar o teto de expiração absoluta de 8h.
export async function setAdminSessionCookie(params: {
  sub: string
  username: string
  mustChangePassword: boolean
  loginAt?: number
}): Promise<void> {
  const token = await signAdminToken(params)
  const store = await cookies()
  store.set(ADMIN_SESSION_COOKIE, token, cookieOptions())
}

// Encerra a sessão ADMIN (logout da seção — DP3). Não afeta o login do
// portal (Supabase Auth).
export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ADMIN_SESSION_COOKIE)
}
