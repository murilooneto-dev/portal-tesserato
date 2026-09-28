import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export interface LinhaValor { id: string; valorAtual: ValorCelula }
export interface ValorConvertido { id: string; valor: ValorCelula }
export interface ResultadoTrocaTipo {
  convertidas: number
  naoConvertidas: number
  valores: ValorConvertido[]
}

// Converte o valor atual de uma célula pro tipo novo. NUNCA apaga: o que não
// converte continua exatamente como estava, mesmo que isso deixe a célula
// com um valor "fora do tipo" da coluna (igual já acontece na importação,
// Fase 1). Célula vazia/nula sempre "converte" pra null, nunca conta como
// falha.
function converterValor(
  valorAtual: ValorCelula,
  tipoNovo: TipoColuna,
  opcoesNovas: OpcaoColuna[] | null,
): { valor: ValorCelula; convertida: boolean } {
  if (valorAtual === null) return { valor: null, convertida: true }
  const texto = String(valorAtual).trim()
  if (texto === '') return { valor: null, convertida: true }

  switch (tipoNovo) {
    case 'texto':
      return { valor: texto, convertida: true }
    case 'numero': {
      const n = paraNumero(valorAtual)
      return n === null ? { valor: valorAtual, convertida: false } : { valor: n, convertida: true }
    }
    case 'data': {
      const d = paraDataISO(valorAtual)
      return d === null ? { valor: valorAtual, convertida: false } : { valor: d, convertida: true }
    }
    case 'opcoes': {
      const bate = (opcoesNovas ?? []).some(o => o.valor === texto)
      return bate ? { valor: texto, convertida: true } : { valor: valorAtual, convertida: false }
    }
    default:
      return { valor: valorAtual, convertida: false }
  }
}

export function prepararTrocaTipo(
  linhas: LinhaValor[],
  tipoNovo: TipoColuna,
  opcoesNovas: OpcaoColuna[] | null,
): ResultadoTrocaTipo {
  let convertidas = 0
  let naoConvertidas = 0
  const valores: ValorConvertido[] = []

  for (const linha of linhas) {
    const { valor, convertida } = converterValor(linha.valorAtual, tipoNovo, opcoesNovas)
    if (convertida) convertidas++
    else naoConvertidas++
    valores.push({ id: linha.id, valor })
  }

  return { convertidas, naoConvertidas, valores }
}
