import type { Tarefa } from '@/lib/types'
import type { StatusFiltroMinhasTarefas } from '@/components/fiscal/MinhasTarefasFiltro'

type ClienteBase = { id: string; nome: string; atividade: string[] }
type TarefaBase = Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>

export function statusBate(
  clienteId: string,
  statusFiltro: StatusFiltroMinhasTarefas,
  mapaTarefa: Map<string, TarefaBase>,
  getSemMovimento: (clienteId: string) => boolean = id => !!mapaTarefa.get(id)?.sem_movimento,
): boolean {
  if (statusFiltro === 'TODOS') return true
  if (statusFiltro === 'SEM_MOVIMENTO') return getSemMovimento(clienteId)
  const concluida = !!mapaTarefa.get(clienteId)?.concluida
  if (statusFiltro === 'CONCLUIDA') return concluida && !getSemMovimento(clienteId)
  return !concluida // PENDENTE
}

export function filtrarClientes<C extends ClienteBase>(
  clientes: C[],
  mapaTarefa: Map<string, TarefaBase>,
  busca: string,
  statusFiltro: StatusFiltroMinhasTarefas,
  atividadeFiltro: string[],
  getSemMovimento?: (clienteId: string) => boolean,
): C[] {
  return clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
    && statusBate(c.id, statusFiltro, mapaTarefa, getSemMovimento)
    && (atividadeFiltro.length === 0 || (c.atividade.length === atividadeFiltro.length && atividadeFiltro.every(a => c.atividade.includes(a))))
  )
}
