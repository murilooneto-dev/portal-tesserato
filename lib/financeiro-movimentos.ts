// lib/financeiro-movimentos.ts
//
// Leitura dos lançamentos do Financeiro (Recebimentos, Pagamentos e
// Relatórios). O Supabase (PostgREST) devolve no máximo 1000 linhas por
// requisição mesmo quando `.limit()` pede mais, então a busca anda em blocos
// de 1000 com `.range()` até vir um bloco incompleto (mesmo modelo de
// lib/tarefas-paginacao.ts). Antes as listas paravam em 200 e o relatório em
// 1000 sem aviso, e o total mostrado ficava errado.

export const TAMANHO_BLOCO = 1000

type Bloco<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Chama `consulta(inicio, fim)` em blocos de 1000 e junta tudo. */
export async function buscarEmBlocos<T>(consulta: (inicio: number, fim: number) => Bloco<T>): Promise<T[]> {
  const linhas: T[] = []
  for (let inicio = 0; ; inicio += TAMANHO_BLOCO) {
    const { data, error } = await consulta(inicio, inicio + TAMANHO_BLOCO - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    linhas.push(...data)
    if (data.length < TAMANHO_BLOCO) break
  }
  return linhas
}

export function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Valor com sinal na frente para saídas e saldo negativo: "- R$ 1.750,00". */
export function formatarValorComSinal(v: number): string {
  return v < 0 ? `- ${formatarValor(Math.abs(v))}` : formatarValor(v)
}

/**
 * Datas de um pagamento recorrente: a data informada e o mesmo dia de cada
 * mês seguinte, até dezembro do mesmo ano. Dia que não existe no mês (29, 30,
 * 31) vira o último dia dele. Contas em ano/mês/dia inteiros, sem `Date`
 * local, pra não escorregar um dia por causa do fuso (ver lib/formatar-data.ts).
 */
export function datasRecorrentes(dataISO: string): string[] {
  const m = dataISO.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return []
  const ano = Number(m[1]), mesInicial = Number(m[2]), dia = Number(m[3])
  const ultimoDia = (mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  if (mesInicial < 1 || mesInicial > 12 || dia < 1 || dia > ultimoDia(mesInicial)) return []

  const datas: string[] = []
  for (let mes = mesInicial; mes <= 12; mes++) {
    const d = Math.min(dia, ultimoDia(mes))
    datas.push(`${m[1]}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return datas
}

/** Primeiro e último dia (YYYY-MM-DD) do mês escolhido no seletor do portal. */
export function intervaloDoMes(mes: number, ano: number): { inicio: string; fim: string } {
  const mm = String(mes).padStart(2, '0')
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

export type SituacaoPagamento = 'pago' | 'a_pagar' | 'vencido'

/**
 * Situação de um pagamento: confirmado é "pago"; sem confirmação é "a pagar"
 * até o dia do vencimento (inclusive) e "vencido" depois dele.
 */
export function situacaoPagamento(m: { pago?: boolean | null; data: string }, hoje: string): SituacaoPagamento {
  if (m.pago !== false) return 'pago'
  return m.data < hoje ? 'vencido' : 'a_pagar'
}
