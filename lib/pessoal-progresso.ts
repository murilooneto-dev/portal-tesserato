// lib/pessoal-progresso.ts — regra A do % mensal do cliente no Pessoal.
//
// Para cada mês: esperadas = tarefas automáticas/personalizadas visíveis no mês
// (meses_visiveis) + tipos de parcelamento com tarefa naquele mês e parcelamento
// ativo. % = concluídas (dentre as esperadas) / esperadas.
// Usado pela lista de clientes do Pessoal e pela ficha (quadro dos 12 meses),
// pra as duas telas nunca divergirem.

import { filtrarTarefasVisiveis } from './tarefa-tipos'

export interface TarefaProgressoPessoal {
  mes: number
  concluida: boolean
  tipo: string
  parcelamento_id: string | null
}

export interface ProgressoMesPessoal {
  total: number
  concluidas: number
  pct: number | null
}

export function progressoMensalPessoal(input: {
  // calcularTarefasEsperadas(cliente, mapaVinculos)
  esperadasBase: string[]
  mesesVisiveisPorTipo: Record<string, number[] | null>
  // tarefas do cliente (pode ser o ano inteiro; só os meses 1..12 são lidos)
  tarefas: TarefaProgressoPessoal[]
  // ids de parcelamentos ativos (idsDeParcelamentosAtivos)
  parcelamentosAtivos: Set<string>
}): Record<number, ProgressoMesPessoal> {
  const porMes: Record<number, ProgressoMesPessoal> = {}
  for (let m = 1; m <= 12; m++) {
    const doMes = input.tarefas.filter(t => t.mes === m)
    const tiposParcelamento = doMes
      .filter(t => t.parcelamento_id && input.parcelamentosAtivos.has(t.parcelamento_id))
      .map(t => t.tipo)
    const esperados = new Set([
      ...filtrarTarefasVisiveis(input.esperadasBase, input.mesesVisiveisPorTipo, m),
      ...tiposParcelamento,
    ])
    const concluidas = doMes.filter(t => t.concluida && esperados.has(t.tipo)).length
    const total = esperados.size
    porMes[m] = {
      total,
      concluidas,
      pct: total > 0 ? Math.round((concluidas / total) * 100) : null,
    }
  }
  return porMes
}
