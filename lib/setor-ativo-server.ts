// lib/setor-ativo-server.ts
import { cookies } from 'next/headers'
import { SETOR_ATIVO_COOKIE, isUserSetor } from '@/lib/setor-ativo'
import type { UserSetor } from '@/lib/types'

/** Lê o setor ativo salvo (cookie, escrito pelo TopNav ao trocar de aba), com fallback. */
export async function getSetorAtivo(fallback: UserSetor): Promise<UserSetor> {
  const cookieStore = await cookies()
  const valor = cookieStore.get(SETOR_ATIVO_COOKIE)?.value
  return isUserSetor(valor) ? valor : fallback
}
