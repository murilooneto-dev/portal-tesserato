import type { GrupoSetor } from '@/lib/types'
import { normalizarNome } from '@/lib/config-entidades'

export type ItemChecklist<T> =
  | { tipo: 'tarefa'; tarefa: T }
  | { tipo: 'grupo'; grupo: GrupoSetor; tarefas: T[] }

// Ordena o que a checklist desenha: tarefa fora de grupo fica como veio; o
// grupo aparece onde sua primeira tarefa apareceria (mesmo comportamento do
// Contábil) e leva só as tarefas que ESTE cliente tem. Grupo sem nenhuma
// tarefa do cliente não aparece. Se uma tarefa estiver em dois grupos (não
// deveria), vale o primeiro: nunca duplica.
export function organizarEmGrupos<T extends { nome: string }>(tarefas: T[], grupos: GrupoSetor[]): ItemChecklist<T>[] {
  if (grupos.length === 0) return tarefas.map(tarefa => ({ tipo: 'tarefa', tarefa }))

  const grupoPorTarefa = new Map<string, GrupoSetor>()
  for (const g of grupos) {
    for (const nome of g.tarefas) {
      if (!grupoPorTarefa.has(nome)) grupoPorTarefa.set(nome, g)
    }
  }

  const itens: ItemChecklist<T>[] = []
  const itemDoGrupo = new Map<string, { tipo: 'grupo'; grupo: GrupoSetor; tarefas: T[] }>()
  for (const tarefa of tarefas) {
    const grupo = grupoPorTarefa.get(tarefa.nome)
    if (!grupo) { itens.push({ tipo: 'tarefa', tarefa }); continue }
    let item = itemDoGrupo.get(grupo.id)
    if (!item) {
      item = { tipo: 'grupo', grupo, tarefas: [] }
      itemDoGrupo.set(grupo.id, item)
      itens.push(item)
    }
    item.tarefas.push(tarefa)
  }
  return itens
}

// Uma tarefa só pode estar num grupo do setor. Devolve a mensagem de erro
// (nomeando a tarefa e o outro grupo) ou null. `ignorarId` é o grupo que está
// sendo editado.
export function erroTarefaEmOutroGrupo(tarefas: string[], grupos: GrupoSetor[], ignorarId?: string): string | null {
  for (const nome of tarefas) {
    const outro = grupos.find(g => g.id !== ignorarId && g.tarefas.includes(nome))
    if (outro) return `A tarefa "${nome}" já está no grupo "${outro.nome}". Uma tarefa só pode ficar em um grupo.`
  }
  return null
}

// Nome equivalente (sem acento e sem diferença de maiúsculas) ao de outro grupo?
export function nomeDeGrupoRepetido(nome: string, grupos: GrupoSetor[], ignorarId?: string): boolean {
  const alvo = normalizarNome(nome)
  return grupos.some(g => g.id !== ignorarId && normalizarNome(g.nome) === alvo)
}
