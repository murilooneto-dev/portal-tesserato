import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export const MAX_TEXTO_CELULA = 5000

export type ResultadoCelula = { ok: true; valor: ValorCelula } | { ok: false; erro: string }

const erro = (msg: string): ResultadoCelula => ({ ok: false, erro: msg })

// Converte o que o usuário digitou/escolheu para o valor guardado na célula.
// Campo vazio vira null. O que não converte é RECUSADO (a edição, ao contrário
// da importação, não guarda texto solto em coluna de número/data).
export function converterEntradaCelula(
  tipo: TipoColuna,
  entrada: unknown,
  opcoes: OpcaoColuna[] | null,
): ResultadoCelula {
  if (tipo === 'cliente') return erro('A coluna de cliente é alterada pelo seletor de cliente.')
  if (entrada === null || entrada === undefined) return { ok: true, valor: null }
  if (typeof entrada !== 'string' && typeof entrada !== 'number') return erro('Valor inválido.')

  const texto = String(entrada).trim()
  if (texto === '') return { ok: true, valor: null }

  switch (tipo) {
    case 'texto':
      if (texto.length > MAX_TEXTO_CELULA) return erro(`O texto pode ter no máximo ${MAX_TEXTO_CELULA} caracteres.`)
      return { ok: true, valor: texto }
    case 'numero': {
      const n = paraNumero(texto)
      return n === null ? erro('Número inválido. Use dígitos, com vírgula para decimais (ex.: 1.234,56).') : { ok: true, valor: n }
    }
    case 'data': {
      const d = paraDataISO(texto)
      return d === null ? erro('Data inválida. Use DD/MM/AAAA.') : { ok: true, valor: d }
    }
    case 'opcoes':
      return (opcoes ?? []).some(o => o.valor === texto) ? { ok: true, valor: texto } : erro('Opção inválida: escolha um valor da lista.')
    default:
      return erro('Tipo de coluna desconhecido.')
  }
}
