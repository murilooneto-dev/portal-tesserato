'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ClienteResumo {
  id: string
  nome: string
}

async function exigirAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

// Societário não tem clientes_societario — qualquer cliente cadastrado é
// elegível pro vínculo direto, sem filtro de setor.
export async function listarClientesParaVinculo(): Promise<{ data: ClienteResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('clientes').select('id, nome').order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as ClienteResumo[], error: null }
}

export async function listarClienteIdsVinculados(
  tarefaTipoId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipo_vinculos')
    .select('entidade_id')
    .eq('entidade_tipo', 'cliente')
    .eq('tarefa_tipo_id', tarefaTipoId)

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []).map(row => row.entidade_id as string), error: null }
}

export async function alternarVinculoCliente(
  tarefaTipoId: string,
  clienteId: string,
  vincular: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  if (vincular) {
    // created_at fica com o default now() do insert — é o que garante que
    // vincular hoje não gera pendência retroativa de meses já passados
    // (ver lib/tarefas-societario-periodicidade.ts:tarefaEsperadaNoPeriodo).
    const { error: insertError } = await supabase
      .from('tarefa_tipo_vinculos')
      .insert({ tarefa_tipo_id: tarefaTipoId, entidade_tipo: 'cliente', entidade_id: clienteId })
    if (insertError && insertError.code !== '23505') return { error: insertError.message }
  } else {
    const { error: deleteError } = await supabase
      .from('tarefa_tipo_vinculos')
      .delete()
      .eq('tarefa_tipo_id', tarefaTipoId)
      .eq('entidade_tipo', 'cliente')
      .eq('entidade_id', clienteId)
    if (deleteError) return { error: deleteError.message }
  }

  revalidatePath('/admin/configuracoes')
  revalidatePath('/societario/clientes')
  return { error: null }
}
