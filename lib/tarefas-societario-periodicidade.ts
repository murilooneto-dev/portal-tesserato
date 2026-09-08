import { tarefaVisivelNoMes } from './tarefa-tipos'

export type Periodicidade = 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

// Meses (1-12) em que cada periodicidade "cai", ancorados no calendário
// (Janeiro), não na data de criação do tipo de tarefa. 'mensal' vira null —
// mesma convenção de tarefa_tipos.meses_visiveis já usada pelo catálogo
// (null/vazio = visível todo mês, ver lib/tarefa-tipos.ts).
const MESES_POR_PERIODICIDADE: Record<Periodicidade, number[] | null> = {
  mensal: null,
  bimestral: [1, 3, 5, 7, 9, 11],
  trimestral: [1, 4, 7, 10],
  semestral: [1, 7],
  anual: [1],
}

export function mesesVisiveisDaPeriodicidade(periodicidade: Periodicidade): number[] | null {
  return MESES_POR_PERIODICIDADE[periodicidade]
}

// Inverso de mesesVisiveisDaPeriodicidade — usado pra pré-selecionar a
// periodicidade ao editar um tipo de tarefa existente. Um array que não
// bate com nenhuma periodicidade conhecida (editado fora desse fluxo) cai
// em 'mensal' por segurança, mesmo comportamento de meses_visiveis vazio.
export function periodicidadeDosMesesVisiveis(mesesVisiveis: number[] | null | undefined): Periodicidade {
  if (!mesesVisiveis || mesesVisiveis.length === 0) return 'mensal'
  const alvo = [...mesesVisiveis].sort((a, b) => a - b).join(',')
  for (const [periodicidade, meses] of Object.entries(MESES_POR_PERIODICIDADE) as [Periodicidade, number[] | null][]) {
    if (meses && meses.join(',') === alvo) return periodicidade as Periodicidade
  }
  return 'mensal'
}

interface VinculoClienteInfo {
  mesesVisiveis: number[] | null
  vinculoCreatedAt: string // ISO timestamptz
}

// Não-retroatividade: um vínculo criado em Ago/2026 não gera pendência de
// Jan..Jul/2026, mesmo que a periodicidade seja mensal. Comparação por
// (ano, mês) do vínculo vs (ano, mês) consultado — o próprio mês em que o
// vínculo foi criado já conta como coberto, não importa o dia.
export function tarefaEsperadaNoPeriodo(
  vinculo: VinculoClienteInfo,
  mes: number,
  ano: number,
): boolean {
  if (!tarefaVisivelNoMes(vinculo.mesesVisiveis, mes)) return false
  const criado = new Date(vinculo.vinculoCreatedAt)
  const anoVinculo = criado.getFullYear()
  const mesVinculo = criado.getMonth() + 1
  return ano > anoVinculo || (ano === anoVinculo && mes >= mesVinculo)
}
