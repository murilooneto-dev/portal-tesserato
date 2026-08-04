import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import {
  ADMIN_SESSION_ABSOLUTE_TTL_SECONDS,
  ADMIN_SESSION_INACTIVITY_TTL_SECONDS,
  ADMIN_SESSION_SECRET_ENV,
} from './constants'

// Núcleo de assinatura/verificação do cookie `ts_admin` — sem I/O de
// cookie (isso fica em server.ts, que usa `next/headers`, e em proxy.ts,
// que usa request/response diretamente). Só usa `jose` (Edge-safe): o
// `proxy.ts` roda no Edge Runtime e não pode depender de bcrypt/driver
// Node do Postgres, só verificar assinatura/expiração de forma stateless.
export interface AdminSessionPayload extends JWTPayload {
  sub: string
  username: string
  mustChangePassword: boolean
  // Instante do login original (epoch, segundos) — fixo entre renovações
  // da sessão; usado para aplicar o teto de expiração absoluta (8h),
  // independente da renovação por inatividade (`exp`, deslizante).
  loginAt: number
}

// SECURITY_REPORT.md MED-3: HS256 com segredo curto é quebrável offline por
// força bruta a partir de um único cookie capturado — exigir >= 32 bytes
// (256 bits) e falhar fechado (mesmo caminho de erro do segredo ausente,
// que já é tratado como falha fechada por quem chama: verifyAdminToken
// captura e retorna null; signAdminToken propaga e quebra o login em vez
// de emitir um token inseguro).
const ADMIN_SESSION_SECRET_MIN_BYTES = 32

function getSecretKey(): Uint8Array {
  const secret = process.env[ADMIN_SESSION_SECRET_ENV]
  if (!secret) {
    throw new Error(
      `${ADMIN_SESSION_SECRET_ENV} não configurada. Adicione em: Vercel → Settings → Environment Variables (ver DEPLOY.md).`
    )
  }
  const key = new TextEncoder().encode(secret)
  if (key.byteLength < ADMIN_SESSION_SECRET_MIN_BYTES) {
    throw new Error(
      `${ADMIN_SESSION_SECRET_ENV} é curta demais (${key.byteLength} bytes; mínimo ${ADMIN_SESSION_SECRET_MIN_BYTES}). Gere um valor novo, ex.: openssl rand -base64 32 (ver DEPLOY.md).`
    )
  }
  return key
}

// Assina um novo token. `loginAt` deve ser preservado (não recalculado)
// nas renovações por inatividade — só um novo login (ou troca de senha
// bem-sucedida) deve reiniciar o teto de 8h.
export async function signAdminToken(params: {
  sub: string
  username: string
  mustChangePassword: boolean
  loginAt?: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const loginAt = params.loginAt ?? now

  return new SignJWT({
    username: params.username,
    mustChangePassword: params.mustChangePassword,
    loginAt,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ADMIN_SESSION_INACTIVITY_TTL_SECONDS)
    .sign(getSecretKey())
}

// Verifica assinatura + expiração por inatividade (via `exp`, checado pelo
// próprio jose) e, adicionalmente, o teto de expiração absoluta (8h desde
// `loginAt`), que o `exp` sozinho não cobre porque é renovado a cada acesso.
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    // SECURITY_REPORT.md BAIXA-1: pin explícito do algoritmo — defesa
    // barata contra regressão futura (ex.: reuso do segredo simétrico em
    // outro contexto que aceite outra família de alg).
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
    const sub = payload.sub
    const username = payload.username
    const mustChangePassword = payload.mustChangePassword
    const loginAt = payload.loginAt

    if (
      typeof sub !== 'string' ||
      typeof username !== 'string' ||
      typeof mustChangePassword !== 'boolean' ||
      typeof loginAt !== 'number'
    ) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (now - loginAt > ADMIN_SESSION_ABSOLUTE_TTL_SECONDS) return null

    return { sub, username, mustChangePassword, loginAt }
  } catch {
    return null
  }
}
