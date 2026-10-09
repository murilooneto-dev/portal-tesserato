// Relatórios do Financeiro: período padrão ao abrir a tela. Sem nenhum filtro
// na URL (tela recém-aberta ou "Limpar"), o relatório vem no mês corrente de
// São Paulo; com qualquer filtro na URL, vale só o que o usuário escolheu.

/** Primeiro e último dia do mês de `hoje` (AAAA-MM-DD, relógio de São Paulo). */
export function mesCorrenteSP(hoje: Date = new Date()): { de: string; ate: string } {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(hoje).split('-').map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const mm = String(mes).padStart(2, '0')
  return { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/** Período a usar: o da URL, ou o mês corrente se a URL não tem filtro nenhum. */
export function periodoDoRelatorio(
  params: Record<string, string | undefined>,
  hoje: Date = new Date(),
): { de?: string; ate?: string } {
  const semFiltro = Object.values(params).every(v => v === undefined || v === '')
  return semFiltro ? mesCorrenteSP(hoje) : { de: params.de || undefined, ate: params.ate || undefined }
}
