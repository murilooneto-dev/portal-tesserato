import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna } from './tipos'
import { ehUuid } from './editar-celula'

export interface FiltroColuna { v?: string; min?: number; max?: number; de?: string; ate?: string }
export interface Consulta {
  q: string
  filtros: Record<string, FiltroColuna>
  ordem: string | null
  desc: boolean
  semCliente: boolean
}
export interface ParamsBrutos { q?: string; filtros?: string; ordem?: string; dir?: string; semCliente?: string }
export interface ColunaConsulta { id: string; tipo: TipoColuna }

export const MAX_BUSCA = 200
const MAX_FILTROS_JSON = 4000

function textoCurto(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t === '' ? undefined : t.slice(0, MAX_BUSCA)
}

function numero(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = paraNumero(typeof v === 'number' ? v : String(v))
  return n === null ? undefined : n
}

function data(v: unknown): string | undefined {
  return typeof v === 'string' ? (paraDataISO(v.trim()) ?? undefined) : undefined
}

// Filtro válido para o tipo da coluna, ou null quando não sobra nada útil.
function limparFiltro(tipo: TipoColuna, bruto: unknown): FiltroColuna | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null
  const b = bruto as Record<string, unknown>
  const f: FiltroColuna = {}
  if (tipo === 'texto' || tipo === 'cliente' || tipo === 'opcoes') {
    const v = textoCurto(b.v)
    if (v !== undefined) f.v = v
  } else if (tipo === 'numero') {
    const min = numero(b.min)
    const max = numero(b.max)
    if (min !== undefined) f.min = min
    if (max !== undefined) f.max = max
  } else if (tipo === 'data') {
    const de = data(b.de)
    const ate = data(b.ate)
    if (de !== undefined) f.de = de
    if (ate !== undefined) f.ate = ate
  }
  return Object.keys(f).length > 0 ? f : null
}

// A URL é entrada não confiável: tudo que não é válido é ignorado em silêncio.
export function parseConsulta(bruto: ParamsBrutos, colunas: ColunaConsulta[]): Consulta {
  const tipoPorId = new Map(colunas.map(c => [c.id, c.tipo]))

  const filtros: Record<string, FiltroColuna> = {}
  if (typeof bruto.filtros === 'string' && bruto.filtros.length <= MAX_FILTROS_JSON) {
    try {
      const obj: unknown = JSON.parse(bruto.filtros)
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        for (const [id, valor] of Object.entries(obj)) {
          const tipo = tipoPorId.get(id)
          if (!tipo || !ehUuid(id)) continue
          const f = limparFiltro(tipo, valor)
          if (f) filtros[id] = f
        }
      }
    } catch {
      // parâmetro corrompido: consulta sem filtros
    }
  }

  const ordem = typeof bruto.ordem === 'string' && tipoPorId.has(bruto.ordem) ? bruto.ordem : null
  const temCliente = colunas.some(c => c.tipo === 'cliente')

  return {
    q: textoCurto(bruto.q) ?? '',
    filtros,
    ordem,
    desc: ordem !== null && bruto.dir === 'desc',
    semCliente: bruto.semCliente === '1' && temCliente,
  }
}

// Query string (sem "?"); vazia quando tudo está no padrão.
export function serializeConsulta(c: Consulta, pagina: number = 1): string {
  const qs = new URLSearchParams()
  if (c.q !== '') qs.set('q', c.q)
  if (Object.keys(c.filtros).length > 0) qs.set('filtros', JSON.stringify(c.filtros))
  if (c.ordem) {
    qs.set('ordem', c.ordem)
    if (c.desc) qs.set('dir', 'desc')
  }
  if (c.semCliente) qs.set('semCliente', '1')
  if (pagina > 1) qs.set('pagina', String(pagina))
  return qs.toString()
}

export function toRpcFiltros(
  c: Consulta,
  colunas: ColunaConsulta[],
): { coluna: string; tipo: TipoColuna; v?: string; min?: number; max?: number; de?: string; ate?: string }[] {
  const tipoPorId = new Map(colunas.map(col => [col.id, col.tipo]))
  const saida: { coluna: string; tipo: TipoColuna; v?: string; min?: number; max?: number; de?: string; ate?: string }[] = []
  for (const [id, f] of Object.entries(c.filtros)) {
    const tipo = tipoPorId.get(id)
    if (tipo) saida.push({ coluna: id, tipo, ...f })
  }
  return saida
}

// Clique no cabeçalho: nova coluna -> asc; mesma coluna asc -> desc; desc -> sem ordenação.
export function alternarOrdem(c: Consulta, colunaId: string): Consulta {
  if (c.ordem !== colunaId) return { ...c, ordem: colunaId, desc: false }
  if (!c.desc) return { ...c, ordem: colunaId, desc: true }
  return { ...c, ordem: null, desc: false }
}

export function temConsultaAtiva(c: Consulta): boolean {
  return c.q !== '' || Object.keys(c.filtros).length > 0 || c.semCliente
}
