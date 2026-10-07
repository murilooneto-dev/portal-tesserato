// lib/financeiro-movimentos.ts
//
// Leitura dos lançamentos do Financeiro (Recebimentos, Pagamentos e
// Relatórios). O Supabase (PostgREST) devolve no máximo 1000 linhas por
// requisição mesmo quando `.limit()` pede mais, então a busca anda em blocos
// de 1000 com `.range()` até vir um bloco incompleto (mesmo modelo de
// lib/tarefas-paginacao.ts). Antes as listas paravam em 200 e o relatório em
// 1000 sem aviso, e o total mostrado ficava errado.

import { formatarDdMm } from './formatar-data'
import type { FinanceiroFormaPagamento } from './types'

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

/**
 * Conta a pagar é a saída que nasceu de uma série antiga (recorrencia_id) ou
 * do Tipo de Saída (competencia, recorrente ou com prazo). Lançamento avulso
 * não tem nenhum dos dois.
 */
export function ehConta(m: { recorrencia_id?: string | null; competencia?: string | null }): boolean {
  return Boolean(m.recorrencia_id) || Boolean(m.competencia)
}

/**
 * Conta a pagar aparece na lista do mês escolhido quando vence nele ou depois
 * (a busca já corta o fim do mês), ou quando já venceu antes de hoje e segue
 * em aberto. Conta de mês intermediário ainda não vencida fica de fora.
 */
export function contaApareceNoMes(data: string, primeiroDia: string, hoje: string): boolean {
  return data >= primeiroDia || data < hoje
}

/**
 * Selo ao lado do nome da conta, em Contas a Pagar e em Pagamentos: como ela
 * se repete. Série antiga (recorrencia_id) é sempre recorrente; conta criada
 * pelo Tipo de Saída segue a forma atual do tipo. Avulso não tem selo, nem a
 * conta cujo tipo voltou para Avulso.
 */
export function rotuloSeloConta(m: {
  recorrencia_id?: string | null
  competencia?: string | null
  tipo_forma?: FinanceiroFormaPagamento | null
}): 'Recorrente' | 'Prazo determinado' | null {
  if (m.recorrencia_id) return 'Recorrente'
  if (!m.competencia) return null
  if (m.tipo_forma === 'recorrente') return 'Recorrente'
  if (m.tipo_forma === 'prazo') return 'Prazo determinado'
  return null
}

/**
 * Ordena Pagamentos pelo que foi pago mais recentemente. Compara o dia
 * (pago_em já é o dia em São Paulo, com ou sem hora guardada) e só usa a hora
 * para desempatar dentro do mesmo dia: comparar a hora direto com o dia
 * misturaria UTC com data local e poria um pagamento das 22h acima dos do dia
 * seguinte que não têm hora.
 */
export function compararPorPagamento(
  a: { data: string; pago_em?: string | null; pago_em_hora?: string | null; created_at: string },
  b: { data: string; pago_em?: string | null; pago_em_hora?: string | null; created_at: string },
): number {
  return (b.pago_em ?? b.data).localeCompare(a.pago_em ?? a.data)
    || (b.pago_em_hora ?? '').localeCompare(a.pago_em_hora ?? '')
    || b.created_at.localeCompare(a.created_at)
}

/**
 * Mês digitado no formulário de forma de pagamento: aceita o valor nativo do
 * campo (AAAA-MM) e o texto digitado (MM/AAAA). Devolve AAAA-MM ou null.
 */
export function normalizarMes(texto: string): string | null {
  const t = texto.trim()
  const iso = /^(\d{4})-(\d{2})$/.exec(t)
  const br = /^(\d{1,2})\/(\d{4})$/.exec(t)
  const [ano, mes] = iso ? [iso[1], iso[2]] : br ? [br[2], br[1]] : [null, null]
  if (!ano || !mes) return null
  const m = Number(mes)
  if (m < 1 || m > 12) return null
  return `${ano}-${String(m).padStart(2, '0')}`
}

/**
 * Contas que uma conta NOVA vai criar, para mostrar antes de salvar. Mesma
 * conta do banco (financeiro_fim_recorrente, migration 065): o Recorrente vai
 * até dezembro do ano de início ou do ano corrente, o que for maior, e em
 * dezembro já inclui o ano seguinte; o Prazo cria a quantidade pedida.
 * `mesInicio` em AAAA-MM; `hoje` é o mês e o ano reais (fuso de São Paulo).
 */
export function previaNovaConta(
  forma: 'recorrente' | 'prazo',
  mesInicio: string,
  qtdMeses: number | null,
  hoje: { mes: number; ano: number },
): ResultadoFormaPagamento {
  const [ano, mes] = mesInicio.split('-').map(Number)
  let criadas: number
  if (forma === 'prazo') {
    criadas = qtdMeses ?? 0
  } else {
    const anoFim = Math.max(ano, hoje.ano + (hoje.mes === 12 ? 1 : 0))
    criadas = (anoFim - ano) * 12 + (12 - mes + 1)
  }
  if (criadas <= 0) return { criadas: 0, alteradas: 0, apagadas: 0, primeira: null, ultima: null }
  // Último mês: início + (criadas - 1) meses, em meses corridos desde o ano zero.
  const corrido = ano * 12 + (mes - 1) + (criadas - 1)
  const ultima = `${Math.floor(corrido / 12)}-${String((corrido % 12) + 1).padStart(2, '0')}-01`
  return { criadas, alteradas: 0, apagadas: 0, primeira: `${mesInicio}-01`, ultima }
}

/** O que a função do banco `financeiro_definir_forma_pagamento` devolve. */
export interface ResultadoFormaPagamento {
  criadas: number
  alteradas: number
  apagadas: number
  /** Primeiro e último mês das contas criadas, como YYYY-MM-01 (nulos se nada é criado). */
  primeira: string | null
  ultima: string | null
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Inteiros a partir de "YYYY-MM-01", sem Date local (ver lib/formatar-data.ts).
function anoMes(iso: string): { ano: number; mes: number } {
  const [ano, mes] = iso.split('-')
  return { ano: Number(ano), mes: Number(mes) }
}

function periodo(primeira: string, ultima: string): string {
  const a = anoMes(primeira), b = anoMes(ultima)
  if (primeira === ultima) return `em ${MESES[a.mes - 1]} de ${a.ano}`
  if (a.ano === b.ano) return `de ${MESES[a.mes - 1]} a ${MESES[b.mes - 1]} de ${a.ano}`
  return `de ${MESES[a.mes - 1]} de ${a.ano} a ${MESES[b.mes - 1]} de ${b.ano}`
}

/** Frase da prévia (simulação) mostrada antes de confirmar a forma de pagamento. */
export function textoPreviaFormaPagamento(
  r: ResultadoFormaPagamento,
  valor: number | null,
  dia: number | null,
): string {
  const frases: string[] = []
  const venc = dia ? `, com vencimento no dia ${dia}` : ''
  const dinheiro = valor !== null ? ` de ${formatarValor(valor)}` : ''

  if (r.criadas > 0) {
    const quando = r.primeira && r.ultima ? `, ${periodo(r.primeira, r.ultima)}` : ''
    frases.push(`${r.criadas === 1 ? 'Será criada 1 conta' : `Serão criadas ${r.criadas} contas`}${dinheiro}${quando}${venc}.`)
  }
  if (r.alteradas > 0) {
    const novo = valor !== null ? `para ${formatarValor(valor)}` : 'de valor ou data'
    frases.push(r.alteradas === 1
      ? `1 conta não paga passa ${novo}${venc}.`
      : `${r.alteradas} contas não pagas passam ${novo}${venc}.`)
  }
  if (r.apagadas > 0) {
    frases.push(r.apagadas === 1 ? '1 conta não paga será apagada.' : `${r.apagadas} contas não pagas serão apagadas.`)
  }
  return frases.length > 0 ? frases.join(' ') : 'Nenhuma conta muda.'
}

/** Quando a conta foi paga: "07/10 às 14:32" (horário de Brasília), "07/10" sem hora, "—" sem nada. */
export function formatarPagoEm(pagoEm: string | null, pagoEmHora: string | null): string {
  if (pagoEmHora) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(pagoEmHora))
    const get = (t: string) => partes.find(p => p.type === t)?.value ?? ''
    return `${get('day')}/${get('month')} às ${get('hour')}:${get('minute')}`
  }
  // formatarDdMm devolve DD/MM/AAAA; aqui só interessa DD/MM.
  if (pagoEm) return formatarDdMm(pagoEm).slice(0, 5) || '—'
  return '—'
}
