import { cookies } from 'next/headers'
import { MES_COOKIE, getMesAnoRealAgora, parseMesAnoCookie } from './mes-atual'

/** Lê o mês/ano selecionado (cookie de sessão) com fallback pro mês/ano real. */
export async function getMesAno(): Promise<{ mes: number; ano: number }> {
  const cookieStore = await cookies()
  const parsed = parseMesAnoCookie(cookieStore.get(MES_COOKIE)?.value)
  return parsed ?? getMesAnoRealAgora()
}
