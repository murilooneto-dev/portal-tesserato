import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from './types'

export interface MapaVinculosSetor {
  porGrupo: Record<string, string[]>
  // Não é mais populado — vínculo solto de regime (sem atividade) foi
  // retirado, ver migration 031. Mantido no tipo só pra não quebrar
  // lib/preenchimento-rapido.ts, que também lê esse campo.
  porRegime: Record<string, string[]>
  porAtividade: Record<string, { tarefa: string; regimeNome: string | null }[]>
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
      .select('entidade_tipo, entidade_id, regime_id, tarefa_tipos!inner(nome, setor)')
      .eq('tarefa_tipos.setor', setor),
  ])

  const nomePorId: Record<string, string> = {}
  for (const g of grupos ?? []) nomePorId[g.id as string] = g.nome as string
  for (const r of regimes ?? []) nomePorId[r.id as string] = r.nome as string
  for (const a of atividades ?? []) nomePorId[a.id as string] = a.nome as string

  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }

  for (const v of vinculos ?? []) {
    const nomeEntidade = nomePorId[v.entidade_id as string]
    if (!nomeEntidade) continue
    const nomeTarefa = (v.tarefa_tipos as unknown as { nome: string }).nome

    if (v.entidade_tipo === 'grupo') {
      if (!mapa.porGrupo[nomeEntidade]) mapa.porGrupo[nomeEntidade] = []
      mapa.porGrupo[nomeEntidade].push(nomeTarefa)
    } else if (v.entidade_tipo === 'atividade') {
      const regimeId = v.regime_id as string | null
      const regimeNome = regimeId ? (nomePorId[regimeId] ?? null) : null
      if (!mapa.porAtividade[nomeEntidade]) mapa.porAtividade[nomeEntidade] = []
      mapa.porAtividade[nomeEntidade].push({ tarefa: nomeTarefa, regimeNome })
    }
    // entidade_tipo === 'regime': vínculo solto retirado (migration 031),
    // ignorado aqui de propósito — ver VincularTarefasModal.tsx pra
    // remoção assistida dos que ainda existem.
  }

  return mapa
}

interface ClienteVinculo {
  grupo?: string | null
  regime?: string | null
  atividade?: string[] | null
}

// Só a parte automática (grupo + atividade/regime), sem tarefas_personalizadas
// nem tarefas_excluidas — reaproveitada tanto por calcularTarefasEsperadas
// quanto pela UI do cadastro (tarefasAutomaticasVisiveis), que precisa saber
// quais tarefas automáticas existem pra poder oferecer excluir uma delas.
function tarefasAutomaticas(cliente: ClienteVinculo, mapa: MapaVinculosSetor): string[] {
  // Vínculo de atividade: regimeNome null = "todos os regimes" (aplica
  // sempre); regimeNome preenchido = só aplica se bater com o regime do
  // cliente (AND atividade+regime).
  const doAtividade = (cliente.atividade ?? []).flatMap(a =>
    (mapa.porAtividade[a] ?? [])
      .filter(e => e.regimeNome === null || e.regimeNome === cliente.regime)
      .map(e => e.tarefa)
  )
  return Array.from(new Set([
    ...(mapa.porGrupo[cliente.grupo ?? ''] ?? []),
    ...doAtividade,
  ]))
}

// Função pura, testável: soma o que os vínculos do grupo/atividade do
// cliente geram (menos o que estiver em tarefas_excluidas) com
// tarefas_personalizadas dele. Nunca duplica (Set). Cliente sem
// grupo/regime/atividade preenchido (ou com um valor que não bate com nada
// do mapa — não cadastrado, renomeado etc.) simplesmente não contribui nada
// desses 2 — a lista vira só tarefas_personalizadas, igual hoje sem nenhum
// fallback. tarefas_excluidas nunca afeta tarefas_personalizadas — readicionar
// manualmente algo excluído já faz ele voltar a aparecer, sem precisar
// "desexcluir" antes.
export function calcularTarefasEsperadas(
  cliente: ClienteVinculo & { tarefas_personalizadas: string[]; tarefas_excluidas?: string[] },
  mapa: MapaVinculosSetor,
): string[] {
  const excluidas = new Set(cliente.tarefas_excluidas ?? [])
  const automaticasAtivas = tarefasAutomaticas(cliente, mapa).filter(t => !excluidas.has(t))
  return Array.from(new Set([...automaticasAtivas, ...cliente.tarefas_personalizadas]))
}

// Pra UI do cadastro: as tarefas automáticas ainda ativas (não excluídas) e
// que não são já uma tarefa personalizada (evita mostrar a mesma tarefa
// duas vezes no campo "Tarefas" do formulário de cliente).
export function tarefasAutomaticasVisiveis(
  cliente: ClienteVinculo & { tarefas_personalizadas?: string[]; tarefas_excluidas?: string[] },
  mapa: MapaVinculosSetor,
): string[] {
  const excluidas = new Set(cliente.tarefas_excluidas ?? [])
  const personalizadas = new Set(cliente.tarefas_personalizadas ?? [])
  return tarefasAutomaticas(cliente, mapa).filter(t => !excluidas.has(t) && !personalizadas.has(t))
}
