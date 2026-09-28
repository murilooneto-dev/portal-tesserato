import type { TipoColuna, ValorCelula } from './tipos'

export function formatarValor(tipo: TipoColuna, valor: ValorCelula): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'data' && typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : valor
  }
  if (tipo === 'numero' && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
  }
  return String(valor)
}
