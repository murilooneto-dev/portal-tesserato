// Compartilhada com o aviso de drift de /fiscal/parametros (que comparava
// nomes de template contra o catálogo tarefa_tipos) — extraída aqui pra
// ser reusada também na migração de dados de cliente (Plano B) e na
// validação de vínculos desta tela.
export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export function validarNomeEntidade(nome: string): string | null {
  const trimmed = nome.trim()
  if (trimmed.length === 0) return 'O nome não pode ficar vazio.'
  if (trimmed.length > 100) return 'O nome não pode passar de 100 caracteres.'
  return null
}

export function ordenarPorNome<T extends { nome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
