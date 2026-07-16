// lib/tarefa-tipos.ts

// `meses_visiveis` null/vazio = tarefa sempre visível (comportamento atual
// de todo o catálogo existente, Fiscal e Contábil não mudam). Quando
// preenchido, a tarefa só é considerada visível nos meses listados —
// usado hoje só pelo 13º Salário do Pessoal (array[11,12]).
export function tarefaVisivelNoMes(mesesVisiveis: number[] | null | undefined, mes: number): boolean {
  return !mesesVisiveis || mesesVisiveis.length === 0 || mesesVisiveis.includes(mes)
}

export function filtrarTarefasVisiveis(
  tarefasPersonalizadas: string[],
  mesesVisiveisPorTipo: Record<string, number[] | null>,
  mes: number,
): string[] {
  return tarefasPersonalizadas.filter(tipo => tarefaVisivelNoMes(mesesVisiveisPorTipo[tipo], mes))
}
