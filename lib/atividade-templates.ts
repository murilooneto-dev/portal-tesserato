// lib/atividade-templates.ts

const BASES = ['Serviço', 'Comércio', 'Indústria'] as const
export type AtividadeBase = typeof BASES[number]

/** Retorna quais bases compõem uma atividade composta */
export function basesDeAtividade(atividade: string): AtividadeBase[] {
  return BASES.filter(base => atividade.includes(base))
}

/**
 * Calcula as tarefas para uma atividade unindo os templates das bases.
 * Ordem: Serviço → Comércio → Indústria. Sem duplicatas.
 */
export function resolverTemplate(
  atividade: string,
  templates: Record<string, string[]>
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const base of basesDeAtividade(atividade)) {
    for (const t of templates[base] ?? []) {
      if (!seen.has(t)) {
        seen.add(t)
        result.push(t)
      }
    }
  }
  return result
}
