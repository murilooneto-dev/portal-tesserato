import type { Tarefa } from './types'
import type { ClienteComFiscal } from './clientes-fiscal'

export interface ProgressoCliente {
  total: number
  feitas: number
  pct: number
  pendentes: string[]
}

export function calcularProgresso(cliente: ClienteComFiscal, tarefas: Tarefa[]): ProgressoCliente {
  const tipos = new Set(cliente.tarefas_personalizadas ?? [])
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const concluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !concluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}

export interface LinhaRelatorio {
  cliente: ClienteComFiscal
  total: number
  feitas: number
  pct: number
  pendentes: string[]
}

export function montarLinhasRelatorio(clientes: ClienteComFiscal[], tarefas: Tarefa[]): LinhaRelatorio[] {
  return clientes
    .map(cliente => ({ cliente, ...calcularProgresso(cliente, tarefas) }))
    .sort((a, b) => a.pct - b.pct)
}
