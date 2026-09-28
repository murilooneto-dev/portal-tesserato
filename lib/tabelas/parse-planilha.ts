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
// (segundos a poucos minutos, de fuso histórico/arredondamento). Somar 10 min
// antes de ler o dia local cobre uma deriva pra trás sem empurrar uma hora
// real (ex.: 23:30) pro dia seguinte, o que um deslocamento de 12h faria.
function dataParaISO(d: Date): string {
  const ajustada = new Date(d.getTime() + 10 * 60 * 1000)
  return `${ajustada.getFullYear()}-${pad(ajustada.getMonth() + 1)}-${pad(ajustada.getDate())}`
}

// ZIP ("PK") = xlsx; OLE (D0 CF 11 E0) = xls; o resto é texto (CSV).
function ehBinario(b: Uint8Array): boolean {
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return true
  return b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
}

function decodificarTexto(b: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    texto = new TextDecoder('windows-1252').decode(b)
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
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
  const bytes = new Uint8Array(buffer)
  // CSV: raw:true impede o SheetJS de adivinhar números/datas (1.234,56, 03/04/2026);
  // as strings originais seguem para paraNumero/paraDataISO.
  const wb = ehBinario(bytes)
    ? XLSX.read(buffer, { type: 'array', cellDates: true })
    : XLSX.read(decodificarTexto(bytes), { type: 'string', raw: true })
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
  // Colunas sem cabeçalho e sem nenhum dado (planilha formatada além do usado) somem.
  const vaziaCol = (i: number) => celula(cab[i]) === null && restante.every(r => celula(r[i]) === null)
  const indices = Array.from({ length: largura }, (_, i) => i).filter(i => !vaziaCol(i))

  const cabecalhos = nomesUnicos(
    indices.map(i => {
      const c = celula(cab[i])
      return c === null ? '' : String(c)
    }),
  )
  const linhas = restante
    .map(r => indices.map(i => celula(r[i])))
    .filter(r => r.some(v => v !== null))

  return { abas, aba, cabecalhos, linhas, linhaCabecalho }
}
