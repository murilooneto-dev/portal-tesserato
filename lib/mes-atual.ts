export const MES_COOKIE = 'mes_selecionado'

/** Mês/ano reais, calculados no fuso de São Paulo (independe do cookie). */
export function getMesAnoRealAgora(): { mes: number; ano: number } {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return { mes: agora.getMonth() + 1, ano: agora.getFullYear() }
}

/** Faz o parse do valor do cookie "MM-YYYY". Retorna null se ausente ou inválido. */
export function parseMesAnoCookie(valor: string | undefined | null): { mes: number; ano: number } | null {
  if (!valor) return null
  const [mesStr, anoStr] = valor.split('-')
  const mes = parseInt(mesStr, 10)
  const ano = parseInt(anoStr, 10)
  if (mes >= 1 && mes <= 12 && ano > 2000 && ano < 3000) {
    return { mes, ano }
  }
  return null
}
