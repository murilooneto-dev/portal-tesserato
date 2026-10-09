import { normalizarNome } from './tarefa-tipo-visibilidade'

// Regimes que o usuário marcou em Minhas Tarefas (tabela minhas_tarefas_regimes).
// Entrada vem de Server Action, então não confia no tipo: fica só texto não
// vazio, sem espaços nas pontas e sem repetição (comparando sem caixa).
export function limparRegimes(regimes: unknown): string[] {
  if (!Array.isArray(regimes)) return []
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const r of regimes) {
    if (typeof r !== 'string') continue
    const chave = normalizarNome(r)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(r.trim())
  }
  return saida
}

export interface OpcaoRegime { nome: string; marcado: boolean; foraDoCatalogo: boolean }

// Opções do campo "Regimes que atendo": o catálogo do setor na ordem dele e,
// depois, o que está marcado mas saiu do catálogo (renomeado ou desativado),
// para o usuário conseguir desmarcar.
export function opcoesDeRegime(catalogo: string[], marcados: string[]): OpcaoRegime[] {
  const chavesMarcadas = new Set(marcados.map(normalizarNome))
  const chavesCatalogo = new Set(catalogo.map(normalizarNome))
  return [
    ...catalogo.map(nome => ({ nome, marcado: chavesMarcadas.has(normalizarNome(nome)), foraDoCatalogo: false })),
    ...marcados
      .filter(nome => !chavesCatalogo.has(normalizarNome(nome)))
      .map(nome => ({ nome, marcado: true, foraDoCatalogo: true })),
  ]
}
