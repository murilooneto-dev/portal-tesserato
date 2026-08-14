'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor } from '@/lib/types'

export type TipoEntidadeVinculo = 'regime' | 'grupo' | 'atividade'

export interface TarefaTipoResumo {
  id: string
  nome: string
  ativo: boolean
}

const ERRO_SESSAO_ADMIN = 'Sessão ADMIN expirada. Faça login novamente.'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const session = await getValidAdminSession()
  if (!session) return { error: ERRO_SESSAO_ADMIN, supabase: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarTarefaTiposDoSetor(
  setor: UserSetor,
): Promise<{ data: TarefaTipoResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipos')
    .select('id, nome, ativo')
    .eq('setor', setor)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as TarefaTipoResumo[], error: null }
}

export async function alternarAtivoTarefaTipo(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('tarefa_tipos').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function listarTarefaTipoIdsVinculados(
  entidadeTipo: TipoEntidadeVinculo,
  entidadeId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipo_vinculos')
    .select('tarefa_tipo_id')
    .eq('entidade_tipo', entidadeTipo)
    .eq('entidade_id', entidadeId)

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []).map(row => row.tarefa_tipo_id as string), error: null }
}

export async function alternarVinculo(
  tarefaTipoId: string,
  entidadeTipo: TipoEntidadeVinculo,
  entidadeId: string,
  vincular: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  if (vincular) {
    const { error: insertError } = await supabase
      .from('tarefa_tipo_vinculos')
      .insert({ tarefa_tipo_id: tarefaTipoId, entidade_tipo: entidadeTipo, entidade_id: entidadeId })
    if (insertError && insertError.code !== '23505') return { error: insertError.message }
  } else {
    const { error: deleteError } = await supabase
      .from('tarefa_tipo_vinculos')
      .delete()
      .eq('tarefa_tipo_id', tarefaTipoId)
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
    if (deleteError) return { error: deleteError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
