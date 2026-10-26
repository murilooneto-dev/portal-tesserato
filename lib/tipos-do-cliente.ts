// Tarefa personalizada de um cliente do Contábil (tarefa_tipos.cliente_id,
// migration 070): criada e apagada junto com o salvar do cadastro dele.
import type { TipoResposta } from './types'
import type { PeriodoTarefas } from './tarefas-esperadas'
import { tarefasRemovidasDoCliente } from './tarefas-do-cliente'

// O que o NovoTipoTarefaModal (modo adiar) devolve: o tipo só é gravado quando
// o cadastro do cliente é salvo.
export interface NovoTipoConfig {
  tipoResposta: TipoResposta
  etapas: string[] | null
  mesesVisiveis: number[] | null
  inicioEm: PeriodoTarefas | null
}

// Nomes que perdem o histórico e o tipo do cliente ao salvar: os que saíram da
// ficha (tarefasRemovidasDoCliente) mais os recriados (nome de tiposNovos que
// já estava na ficha: o tipo e as linhas antigas saem, o novo entra limpo).
export function nomesParaApagar(
  personalizadasAntes: string[],
  esperadasDepois: string[],
  tiposNovos: string[],
): string[] {
  const antes = new Set(personalizadasAntes)
  const recriados = tiposNovos.filter(n => antes.has(n))
  return Array.from(new Set([...tarefasRemovidasDoCliente(personalizadasAntes, esperadasDepois), ...recriados]))
}
