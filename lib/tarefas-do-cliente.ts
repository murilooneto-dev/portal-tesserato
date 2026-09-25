import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from './types'

// Nomes que estavam em tarefas_personalizadas do cliente e saíram dela, e que
// também não continuam aplicáveis por outra via (vínculo de atividade/regime,
// ver calcularTarefasEsperadas) — só esses perdem o histórico. Escopo é sempre
// um cliente: o catálogo (tarefa_tipos) e os outros clientes não são tocados.
export function tarefasRemovidasDoCliente(
  personalizadasAntes: string[] | null | undefined,
  esperadasDepois: string[],
): string[] {
  const continuam = new Set(esperadasDepois)
  return Array.from(new Set(personalizadasAntes ?? [])).filter(t => !continuam.has(t))
}

// `tarefas.tipo` é texto sem FK: sem isto, recriar o mesmo nome no cliente
// religa as linhas antigas (concluída, respostas, datas) por casar o nome.
// tarefa_etapas e tarefa_arquivos saem junto (on delete cascade).
export async function apagarTarefasDoCliente(
  supabase: SupabaseClient,
  clienteId: string,
  setor: UserSetor,
  tipos: string[],
): Promise<{ error?: string }> {
  if (tipos.length === 0) return {}
  const { error } = await supabase
    .from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', setor).in('tipo', tipos)
  return error ? { error: error.message } : {}
}
