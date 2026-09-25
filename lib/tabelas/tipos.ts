export type TipoColuna = 'texto' | 'numero' | 'data' | 'opcoes' | 'cliente'
export const TIPOS_COLUNA: TipoColuna[] = ['texto', 'numero', 'data', 'opcoes', 'cliente']
export type ValorCelula = string | number | null

export interface OpcaoColuna { valor: string; cor: string }

export const CORES_OPCOES = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280', '#ec4899', '#14b8a6']

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// "1.234" é lido como mil duzentos e trinta e quatro (convenção brasileira);
// "1234.56" e "12,5" são decimais.
export function paraNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (s === '') return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function paraDataISO(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let ano: number, mes: number, dia: number
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s)
  if (m) {
    ano = +m[1]; mes = +m[2]; dia = +m[3]
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
    if (!m) return null
    dia = +m[1]; mes = +m[2]; ano = +m[3]
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function opcoesDosValores(valores: string[]): OpcaoColuna[] {
  const unicos = Array.from(new Set(valores.map(v => v.trim()).filter(v => v !== '')))
  return unicos.map((valor, i) => ({ valor, cor: CORES_OPCOES[i % CORES_OPCOES.length] }))
}

export function detectarTipoColuna(
  valores: ValorCelula[],
): { tipo: Exclude<TipoColuna, 'cliente'>; opcoes?: OpcaoColuna[] } {
  const preenchidos = valores.filter(v => !vazio(v)) as (string | number)[]
  if (preenchidos.length === 0) return { tipo: 'texto' }
  if (preenchidos.every(v => paraDataISO(v) !== null)) return { tipo: 'data' }
  if (preenchidos.every(v => paraNumero(v) !== null)) return { tipo: 'numero' }
  const distintos = Array.from(new Set(preenchidos.map(v => String(v).trim())))
  if (
    distintos.length >= 2 && distintos.length <= 8 &&
    preenchidos.length >= distintos.length * 2 &&
    distintos.every(d => d.length <= 30)
  ) {
    return { tipo: 'opcoes', opcoes: opcoesDosValores(distintos) }
  }
  return { tipo: 'texto' }
}
