import type { SupabaseClient } from '@supabase/supabase-js'

// tipo de tarefa do setor -> nome do usuário dono (tarefa_tipos.responsavel_id
// resolvido em profiles.nome). Só entram tipos que têm dono; usado por
// filtrarTiposDoProgresso (lib/tarefa-tipo-visibilidade.ts). Precisa de client
// com acesso a profiles (admin): a RLS esconde perfis alheios do usuário comum,
// então telas usam buscarDonoNomePorTipoFiscal (tarefa-tipo-donos-actions.ts).
export async function buscarDonoNomePorTipo(
  supabase: SupabaseClient,
  setor: string,
): Promise<Record<string, string>> {
  const { data: tipos } = await supabase
    .from('tarefa_tipos').select('nome, responsavel_id').eq('setor', setor).not('responsavel_id', 'is', null)
  const ids = Array.from(new Set((tipos ?? []).map(t => t.responsavel_id as string)))
  if (ids.length === 0) return {}
  const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', ids)
  const nomePorId = new Map((perfis ?? []).map(p => [p.id as string, p.nome as string]))
  const mapa: Record<string, string> = {}
  for (const t of tipos ?? []) {
    const nome = nomePorId.get(t.responsavel_id as string)
    if (nome) mapa[t.nome as string] = nome
  }
  return mapa
}

export function montarRegimesPorTipo(
  tipos: { nome: string; responsavel_id: string | null }[],
  linhas: { user_id: string; regimes: string[] | null }[],
): Record<string, string[]> {
  const porDono = new Map(linhas.map(l => [l.user_id, l.regimes ?? []]))
  const mapa: Record<string, string[]> = {}
  for (const t of tipos) {
    const regimes = t.responsavel_id ? porDono.get(t.responsavel_id) : undefined
    if (regimes && regimes.length > 0) mapa[t.nome] = regimes
  }
  return mapa
}

// tipo de tarefa do setor -> regimes que o dono daquele tipo marcou em Minhas
// Tarefas. Só entram tipos cujo dono marcou algum regime; usado com
// donosNoRegime (lib/tarefa-tipo-visibilidade.ts). A RLS deixa qualquer
// autenticado ler, então serve o client de sessão. Se a consulta falhar o mapa
// sai vazio e tudo se comporta como antes dos regimes existirem.
export async function buscarRegimesPorTipo(
  supabase: SupabaseClient,
  setor: string,
): Promise<Record<string, string[]>> {
  const [{ data: tipos }, { data: linhas }] = await Promise.all([
    supabase.from('tarefa_tipos').select('nome, responsavel_id').eq('setor', setor).not('responsavel_id', 'is', null),
    supabase.from('minhas_tarefas_regimes').select('user_id, regimes').eq('setor', setor),
  ])
  return montarRegimesPorTipo(
    (tipos ?? []) as { nome: string; responsavel_id: string | null }[],
    (linhas ?? []) as { user_id: string; regimes: string[] | null }[],
  )
}
