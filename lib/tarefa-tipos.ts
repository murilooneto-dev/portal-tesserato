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

// Compara ignorando maiúsculas/minúsculas e espaços nas pontas, pra "NFSe"
// e " nfse " não virarem dois tipos diferentes no catálogo.
export function tarefaExisteNoCatalogo(catalogo: string[], nome: string): boolean {
  const alvo = nome.trim().toLowerCase()
  return catalogo.some(c => c.trim().toLowerCase() === alvo)
}


// A grafia que o catálogo usa para o nome (mesma comparação de
// tarefaExisteNoCatalogo), ou null se não houver.
export function nomeNoCatalogo(catalogo: string[], nome: string): string | null {
  const alvo = nome.trim().toLowerCase()
  return catalogo.find(c => c.trim().toLowerCase() === alvo) ?? null
}

// Tipos do Contábil podem ser do setor (cliente_id null) ou personalizados de
// um cliente (migration 070). Para um cliente: um por nome, o do cliente
// vence o do setor, e tipos de outros clientes são descartados.
export function resolverTiposDoCliente<T extends { nome: string; cliente_id: string | null }>(
  tipos: T[],
  clienteId: string,
): T[] {
  const porNome = new Map<string, T>()
  for (const t of tipos) {
    if (t.cliente_id !== null && t.cliente_id !== clienteId) continue
    const atual = porNome.get(t.nome)
    if (!atual || t.cliente_id === clienteId) porNome.set(t.nome, t)
  }
  return Array.from(porNome.values())
}
