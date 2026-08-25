import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from './types'

export interface MapaVinculosSetor {
  porGrupo: Record<string, string[]>
  porRegime: Record<string, string[]>
  porAtividade: Record<string, string[]>
}

// Uma consulta em lote por carregamento de página (nunca por cliente) —
// junta grupos/regimes/atividades (id, nome) com tarefa_tipo_vinculos e
// tarefa_tipos (nome) do setor, monta os 3 mapas nome → [nomes de tarefa].
// Casamento do grupo/regime/atividade do cliente com a entidade do
// catálogo é por nome (sem coluna de ID — decisão do spec de 2026-08-20).
export async function buscarMapaVinculosSetor(
  supabase: SupabaseClient,
  setor: UserSetor,
): Promise<MapaVinculosSetor> {
  const [{ data: grupos }, { data: regimes }, { data: atividades }, { data: vinculos }] = await Promise.all([
    supabase.from('grupos').select('id, nome').eq('setor', setor),
    supabase.from('regimes').select('id, nome').eq('setor', setor),
    supabase.from('atividades').select('id, nome').eq('setor', setor),
    supabase
      .from('tarefa_tipo_vinculos')
      .select('entidade_tipo, entidade_id, tarefa_tipos!inner(nome, setor)')
      .eq('tarefa_tipos.setor', setor),
  ])

  const nomePorId: Record<string, string> = {}
  for (const g of grupos ?? []) nomePorId[g.id as string] = g.nome as string
  for (const r of regimes ?? []) nomePorId[r.id as string] = r.nome as string
  for (const a of atividades ?? []) nomePorId[a.id as string] = a.nome as string

  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }
  const chavePorTipo: Record<string, keyof MapaVinculosSetor> = {
    grupo: 'porGrupo',
    regime: 'porRegime',
    atividade: 'porAtividade',
  }

  for (const v of vinculos ?? []) {
    const nomeEntidade = nomePorId[v.entidade_id as string]
    if (!nomeEntidade) continue
    const chave = chavePorTipo[v.entidade_tipo as string]
    if (!chave) continue
    const nomeTarefa = (v.tarefa_tipos as unknown as { nome: string }).nome
    if (!mapa[chave][nomeEntidade]) mapa[chave][nomeEntidade] = []
    mapa[chave][nomeEntidade].push(nomeTarefa)
  }

  return mapa
}

// Função pura, testável: soma o que os vínculos do grupo/regime/atividade
// do cliente geram com tarefas_personalizadas dele. Nunca duplica (Set).
// Cliente sem grupo/regime/atividade preenchido (ou com um valor que não
// bate com nada do mapa — não cadastrado, renomeado etc.) simplesmente não
// contribui nada desses 3 — a lista vira só tarefas_personalizadas, igual
// hoje sem nenhum fallback.
export function calcularTarefasEsperadas(
  cliente: { grupo?: string | null; regime?: string | null; atividade?: string | null; tarefas_personalizadas: string[] },
  mapa: MapaVinculosSetor,
): string[] {
  const automaticas = [
    ...(mapa.porGrupo[cliente.grupo ?? ''] ?? []),
    ...(mapa.porRegime[cliente.regime ?? ''] ?? []),
    ...(mapa.porAtividade[cliente.atividade ?? ''] ?? []),
  ]
  return Array.from(new Set([...automaticas, ...cliente.tarefas_personalizadas]))
}
