import { MES_COOKIE, getMesAnoRealAgora, parseMesAnoCookie } from './mes-atual'

/** Lê o cookie via document.cookie. Só funciona no browser (guard pra SSR). */
export function getMesAnoCliente(): { mes: number; ano: number } {
  if (typeof document === 'undefined') return getMesAnoRealAgora()
  const match = document.cookie.match(new RegExp(`(?:^|; )${MES_COOKIE}=([^;]*)`))
  const parsed = parseMesAnoCookie(match ? decodeURIComponent(match[1]) : null)
  return parsed ?? getMesAnoRealAgora()
}
