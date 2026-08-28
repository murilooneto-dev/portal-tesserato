'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ProcessoTipoResumo {
  id: string
  nome: string
  etapas: string[] | null
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarProcessoTipos(): Promise<{ data: ProcessoTipoResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('processo_tipos')
    .select('id, nome, etapas')
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as ProcessoTipoResumo[], error: null }
}

export async function criarProcessoTipo(nome: string, etapas: string[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: insertError } = await supabase.from('processo_tipos').insert({
    nome: nome.trim(),
    etapas,
  })

  if (insertError) {
    // unique(nome): outra pessoa criou esse tipo nesse meio tempo — tratado
    // como sucesso, é exatamente o resultado que queríamos.
    if (insertError.code === '23505') return { error: null }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}

export async function excluirProcessoTipo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: deleteError } = await supabase.from('processo_tipos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}
