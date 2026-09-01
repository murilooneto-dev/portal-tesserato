'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  montarProcessoTipos,
  type ProcessoTipoResumo,
  type ProcessoTipoRow,
  type ProcessoSubetapaRow,
  type EtapaForm,
} from '@/lib/processo-tipos'

export type { ProcessoTipoResumo } from '@/lib/processo-tipos'

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

  const { data: tipos, error: tiposError } = await supabase
    .from('processo_tipos')
    .select('id, nome, etapas')
    .order('nome')

  if (tiposError) return { data: [], error: tiposError.message }

  const tipoIds = (tipos ?? []).map(t => t.id as string)
  if (tipoIds.length === 0) return { data: [], error: null }

  const { data: subetapas, error: subetapasError } = await supabase
    .from('processo_subetapas')
    .select('id, processo_tipo_id, etapa_nome, nome, tipo_resposta, ordem')
    .in('processo_tipo_id', tipoIds)

  if (subetapasError) return { data: [], error: subetapasError.message }

  return {
    data: montarProcessoTipos(
      tipos as unknown as ProcessoTipoRow[],
      (subetapas ?? []) as unknown as ProcessoSubetapaRow[],
    ),
    error: null,
  }
}

export async function criarProcessoTipo(nome: string, etapas: EtapaForm[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: tipoInserido, error: insertError } = await supabase
    .from('processo_tipos')
    .insert({ nome: nome.trim(), etapas: etapas.map(etapa => etapa.nome) })
    .select('id')
    .single()

  if (insertError) {
    // unique(nome): outra pessoa criou esse tipo nesse meio tempo — tratado
    // como sucesso, é exatamente o resultado que queríamos.
    if (insertError.code === '23505') return { error: null }
    return { error: insertError.message }
  }

  const processoTipoId = tipoInserido.id as string

  const subetapasParaInserir = etapas.flatMap(etapa =>
    etapa.subetapas.map((sub, subIndex) => ({
      processo_tipo_id: processoTipoId,
      etapa_nome: etapa.nome,
      nome: sub.nome,
      tipo_resposta: sub.tipoResposta,
      ordem: subIndex,
    }))
  )

  if (subetapasParaInserir.length > 0) {
    const { error: subetapasError } = await supabase.from('processo_subetapas').insert(subetapasParaInserir)
    if (subetapasError) {
      // Sem transação client-side no supabase-js — desfaz manualmente pra
      // não deixar um processo_tipo órfão sem as subetapas que pediram.
      await supabase.from('processo_tipos').delete().eq('id', processoTipoId)
      return { error: subetapasError.message }
    }
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
