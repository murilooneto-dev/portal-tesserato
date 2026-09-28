import * as XLSX from 'xlsx'
import type { TipoColuna, ValorCelula } from './tipos'

export interface ColunaExport { id: string; nome: string; tipo: TipoColuna }
export interface LinhaExport { dados: Record<string, ValorCelula> }

export function nomeAbaSeguro(nome: string): string {
  const limpo = nome.replace(/[\[\]:*?/\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 31).trim()
  return limpo === '' ? 'Tabela' : limpo
}

export function nomeArquivoSeguro(nome: string): string {
  const base = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${base === '' ? 'tabela' : base}.xlsx`
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

// Números e datas viram células reais do Excel; o que a importação manteve
// como texto (não convertível) continua texto. Strings nunca viram fórmula:
// o SheetJS grava string como string (t:'s'), sem interpretar '=' no início.
function celulaExport(tipo: TipoColuna, valor: ValorCelula): string | number | Date | null {
  if (valor === null) return null
  if (tipo === 'data' && typeof valor === 'string') {
    const m = ISO.exec(valor)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return valor
  }
  return valor
}

export function montarXlsx(nome: string, colunas: ColunaExport[], linhas: LinhaExport[]): Uint8Array {
  const aoa: (string | number | Date | null)[][] = [
    colunas.map(c => c.nome),
    ...linhas.map(l => colunas.map(c => celulaExport(c.tipo, l.dados[c.id] ?? null))),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

  colunas.forEach((c, i) => {
    if (c.tipo !== 'data') return
    for (let r = 1; r <= linhas.length; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: i })]
      if (cel && cel.t === 'd') cel.z = 'dd/mm/yyyy'
    }
  })
  ws['!cols'] = colunas.map(c => ({ wch: Math.min(Math.max(c.nome.length + 2, 12), 40) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomeAbaSeguro(nome))
  const saida = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer
  return new Uint8Array(saida)
}
