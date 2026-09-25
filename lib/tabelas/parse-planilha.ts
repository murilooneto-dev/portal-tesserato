import * as XLSX from 'xlsx'
import type { ValorCelula } from './tipos'

export interface PlanilhaLida {
  abas: string[]
  aba: string
  cabecalhos: string[]
  linhas: ValorCelula[][]
  linhaCabecalho: number
}

export function nomesUnicos(cabs: string[]): string[] {
  const usados = new Set<string>()
  return cabs.map((c, i) => {
    const literal = c.trim()
    const base = literal || `Coluna ${i + 1}`
    // Literais que aparecem depois são donos dos seus nomes: nomes gerados não os roubam.
    const depois = new Set(cabs.slice(i + 1).map(x => x.trim().toLowerCase()).filter(Boolean))
    let nome = base
    let n = 1
    while (usados.has(nome.toLowerCase()) || ((n > 1 || !literal) && depois.has(nome.toLowerCase()))) {
      n++
      nome = `${base} (${n})`
    }
    usados.add(nome.toLowerCase())
    return nome
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

// O SheetJS entrega datas como Date em horário local com pequenas derivas
// (segundos); somar 12h antes de ler o dia local evita cair no dia anterior.
function dataParaISO(d: Date): string {
  const meioDia = new Date(d.getTime() + 12 * 60 * 60 * 1000)
  return `${meioDia.getFullYear()}-${pad(meioDia.getMonth() + 1)}-${pad(meioDia.getDate())}`
}

function celula(v: unknown): ValorCelula {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dataParaISO(v)
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function lerPlanilha(
  buffer: ArrayBuffer,
  opts: { aba?: string; linhaCabecalho?: number } = {},
): PlanilhaLida {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const abas = wb.SheetNames
  if (abas.length === 0) throw new Error('O arquivo não tem nenhuma aba com dados.')
  const aba = opts.aba && abas.includes(opts.aba) ? opts.aba : abas[0]

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], {
    header: 1, raw: true, defval: null, blankrows: false,
  })
  if (matriz.length === 0) throw new Error('A aba está vazia: não há cabeçalho nem dados.')

  const linhaCabecalho = Math.min(Math.max(opts.linhaCabecalho ?? 1, 1), matriz.length)
  const cab = matriz[linhaCabecalho - 1]
  const restante = matriz.slice(linhaCabecalho)
  const largura = restante.reduce((m, r) => Math.max(m, r.length), cab.length)

  const cabecalhos = nomesUnicos(
    Array.from({ length: largura }, (_, i) => {
      const c = celula(cab[i])
      return c === null ? '' : String(c)
    }),
  )
  const linhas = restante
    .map(r => Array.from({ length: largura }, (_, i) => celula(r[i])))
    .filter(r => r.some(v => v !== null))

  return { abas, aba, cabecalhos, linhas, linhaCabecalho }
}
