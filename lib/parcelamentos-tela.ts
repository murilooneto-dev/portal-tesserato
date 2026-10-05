// Regras puras da tela de Parcelamentos (Fiscal): tipos, filtro, agrupamento
// por seção e estado da régua dos 12 meses. Sem React nem banco.
import type { StatusParcelamento } from './parcelamentos-aviso'

export interface SecaoParcelamento {
  id: string
  nome: string
}

export const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
export const MESES_COLS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
export const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export type ColunaMes = (typeof MESES_COLS)[number]

export interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  status: StatusParcelamento
  setores: string[]
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}

export const TODOS = 'TODOS'

export interface FiltroParcelamentos {
  busca: string
  secao: string
  responsavel: string
}

// Mesmo critério de sempre: busca em empresa, CNPJ e responsável.
export function filtrarParcelamentos(itens: Parcelamento[], f: FiltroParcelamentos): Parcelamento[] {
  const q = f.busca.toLowerCase()
  return itens.filter(p => {
    const bateBusca = !f.busca || p.empresa.toLowerCase().includes(q) ||
      (p.cnpj ?? '').includes(q) || (p.responsavel ?? '').toLowerCase().includes(q)
    const bateSecao = f.secao === TODOS || p.secao === f.secao
    const bateResp = f.responsavel === TODOS || p.responsavel === f.responsavel
    return bateBusca && bateSecao && bateResp
  })
}

// Seções a mostrar, na ordem cadastrada (ou só a filtrada).
export function secoesParaMostrar(secoes: SecaoParcelamento[], secaoFiltro: string): string[] {
  return secaoFiltro === TODOS ? secoes.map(s => s.nome) : [secaoFiltro]
}

export interface GrupoSecao {
  secao: string
  itens: Parcelamento[]
}

// Seções sem parcelamento ficam de fora; itens de seção desconhecida também (como hoje).
export function agruparPorSecao(filtrados: Parcelamento[], nomesSecoes: string[]): GrupoSecao[] {
  return nomesSecoes
    .map(secao => ({ secao, itens: filtrados.filter(p => p.secao === secao) }))
    .filter(g => g.itens.length > 0)
}

export function valorDoMes(p: Parcelamento, coluna: ColunaMes): string | null {
  return p[coluna]?.trim() ? p[coluna] : null
}

export function parcelasEmitidas(p: Parcelamento): number {
  return MESES_COLS.filter(c => valorDoMes(p, c) !== null).length
}

export interface MesDaRegua {
  coluna: ColunaMes
  abrev: string
  nome: string
  data: string | null
  emitida: boolean
  atual: boolean
}

// `mesAtual` é 1-12 (ou null para não marcar nenhum).
export function reguaDeMeses(p: Parcelamento, mesAtual: number | null): MesDaRegua[] {
  return MESES_COLS.map((coluna, i) => {
    const data = valorDoMes(p, coluna)
    return { coluna, abrev: MESES_ABREV[i], nome: MESES_NOME[i], data, emitida: data !== null, atual: mesAtual === i + 1 }
  })
}

export function textoEmitidas(p: Parcelamento): string {
  return `${parcelasEmitidas(p)} de 12 emitidas`
}

export function statusVisual(status: StatusParcelamento): { tom: 'ok' | 'dng' | 'acc'; rotulo: string } {
  if (status === 'LIQUIDADO') return { tom: 'ok', rotulo: 'Liquidado' }
  if (status === 'CANCELADO') return { tom: 'dng', rotulo: 'Cancelado' }
  return { tom: 'acc', rotulo: 'Em andamento' }
}

export function subtituloContagem(total: number, secoes: number): string {
  const p = `${total} ${total === 1 ? 'parcelamento' : 'parcelamentos'}`
  return `${p} em ${secoes} ${secoes === 1 ? 'seção' : 'seções'}`
}

export const SETORES_PARCELAMENTO: { valor: string; label: string }[] = [
  { valor: 'fiscal', label: 'Fiscal' },
  { valor: 'contabil', label: 'Contábil' },
  { valor: 'pessoal', label: 'Pessoal' },
]

export function rotuloDoSetor(valor: string): string {
  return SETORES_PARCELAMENTO.find(s => s.valor === valor)?.label ?? valor
}
