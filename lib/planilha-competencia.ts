// lib/planilha-competencia.ts — mês de referência (competência) de uma planilha de NF-e.
// Usado pelas Planilhas anexadas do Fiscal; os helpers de coluna também servem à Conferência.
import * as XLSX from 'xlsx'

export interface Competencia { mes: number; ano: number }

export function normalizar(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

export function encontrarCol(keys: string[], ...termos: string[]): string | undefined {
  return keys.find(k => termos.some(t => k.toLowerCase().replace(/[\s._-]/g, '').includes(t)))
}

// Termos em ordem de preferência: a coluna de emissão ganha de qualquer outra "data".
const TERMOS_DATA = ['dataemissao', 'dtemissao', 'emissao', 'dtemi', 'data']

function colunaData(keys: string[]): string | undefined {
  for (const t of TERMOS_DATA) {
    const col = encontrarCol(keys, t)
    if (col) return col
  }
  return undefined
}

function valida(mes: number, ano: number): Competencia | null {
  return mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100 ? { mes, ano } : null
}

export function competenciaDeData(v: unknown): Competencia | null {
  if (v instanceof Date) return valida(v.getUTCMonth() + 1, v.getUTCFullYear())
  // Número serial do Excel (dias desde 1899-12-30)
  if (typeof v === 'number') {
    if (v < 30000 || v > 80000) return null
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return valida(d.getUTCMonth() + 1, d.getUTCFullYear())
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-\d{2}/)
  if (m) return valida(Number(m[2]), Number(m[1]))
  m = s.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})/)
  if (m) return valida(Number(m[1]), Number(m[2]))
  return null
}

// AAMM fica nas posições 3–6 da chave de acesso de 44 dígitos.
export function competenciaDeChave(chave: string): Competencia | null {
  if (chave.length !== 44) return null
  return valida(Number(chave.slice(4, 6)), 2000 + Number(chave.slice(2, 4)))
}

// Mês mais frequente entre as notas; datas de emissão primeiro, chaves como reserva.
export function competenciaDaPlanilha(base64: string): Competencia | null {
  try {
    const wb = XLSX.read(base64, { type: 'base64' })
    const porData = new Map<string, number>()
    const porChave = new Map<string, number>()
    const contar = (mapa: Map<string, number>, c: Competencia | null) => {
      if (c) mapa.set(`${c.ano}-${c.mes}`, (mapa.get(`${c.ano}-${c.mes}`) ?? 0) + 1)
    }

    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' })
      for (const row of rows) {
        const keys = Object.keys(row)
        const colData = colunaData(keys)
        if (colData) contar(porData, competenciaDeData(row[colData]))
        for (const val of Object.values(row)) {
          const chave = normalizar(val)
          if (chave.length === 44) { contar(porChave, competenciaDeChave(chave)); break }
        }
      }
    }

    const mapa = porData.size ? porData : porChave
    let melhor: string | null = null
    for (const [k, n] of mapa) if (!melhor || n > mapa.get(melhor)!) melhor = k
    if (!melhor) return null
    const [ano, mes] = melhor.split('-').map(Number)
    return { mes, ano }
  } catch {
    return null
  }
}
