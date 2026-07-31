// lib/setor-ativo.ts
import { SETORES, type UserSetor } from '@/lib/types'

export const SETOR_ATIVO_COOKIE = 'setor-ativo'

export function isUserSetor(value: string | undefined): value is UserSetor {
  return !!value && (SETORES as string[]).includes(value)
}
