import type { SupabaseClient } from '@supabase/supabase-js'

// tipo de tarefa do setor -> nome do usuário dono (tarefa_tipos.responsavel_id
// resolvido em profiles.nome). Só entram tipos que têm dono; usado por
// filtrarTiposDoProgresso (lib/tarefa-tipo-visibilidade.ts).
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
