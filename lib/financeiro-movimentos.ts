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
 * Conta a pagar é a saída que nasceu de uma série (recorrencia_id) ou de um
 * prazo (competencia). Lançamento avulso não tem nenhum dos dois.
 */
export function ehConta(m: { recorrencia_id?: string | null; competencia?: string | null }): boolean {
  return Boolean(m.recorrencia_id) || Boolean(m.competencia)
}

/** O que a função do banco `financeiro_definir_forma_pagamento` devolve. */
export interface ResultadoFormaPagamento {
  criadas: number
  alteradas: number
  apagadas: number
  /** Primeiro e último mês das contas criadas, como YYYY-MM-01. */
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
  forma: FinanceiroFormaPagamento,
  valor: number | null,
  dia: number | null,
): string {
  // `forma` fica na assinatura para a UI; o texto já sai dos efeitos do banco.
  void forma
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
