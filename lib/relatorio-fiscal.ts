import type { Cliente, Tarefa } from './types'

export interface ProgressoCliente {
  total: number
  feitas: number
  pct: number
  pendentes: string[]
}

export function calcularProgresso(cliente: Cliente, tarefas: Tarefa[]): ProgressoCliente {
  const tipos = new Set(cliente.tarefas_personalizadas ?? [])
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const concluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !concluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}

export interface LinhaRelatorio {
  cliente: Cliente
  total: number
  feitas: number
  pct: number
  pendentes: string[]
}

export function montarLinhasRelatorio(clientes: Cliente[], tarefas: Tarefa[]): LinhaRelatorio[] {
  return clientes
    .map(cliente => ({ cliente, ...calcularProgresso(cliente, tarefas) }))
    .sort((a, b) => a.pct - b.pct)
}
