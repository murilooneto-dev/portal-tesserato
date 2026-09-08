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

export async function moverSubetapaOrdem(subetapaId: string, direcao: 'up' | 'down'): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: alvo, error: alvoError } = await supabase
    .from('processo_subetapas')
    .select('id, processo_tipo_id, etapa_nome, ordem')
    .eq('id', subetapaId)
    .single()
  if (alvoError || !alvo) return { error: alvoError?.message ?? 'Subetapa não encontrada.' }

  const { data: irmas, error: irmasError } = await supabase
    .from('processo_subetapas')
    .select('id, ordem')
    .eq('processo_tipo_id', alvo.processo_tipo_id)
    .eq('etapa_nome', alvo.etapa_nome)
    .order('ordem')
  if (irmasError || !irmas) return { error: irmasError?.message ?? 'Erro ao buscar subetapas.' }

  const index = irmas.findIndex(s => s.id === subetapaId)
  const vizinhoIndex = direcao === 'up' ? index - 1 : index + 1
  if (index === -1 || vizinhoIndex < 0 || vizinhoIndex >= irmas.length) return { error: null }

  const atual = irmas[index]
  const vizinho = irmas[vizinhoIndex]

  const { error: err1 } = await supabase.from('processo_subetapas').update({ ordem: vizinho.ordem }).eq('id', atual.id)
  if (err1) return { error: err1.message }
  const { error: err2 } = await supabase.from('processo_subetapas').update({ ordem: atual.ordem }).eq('id', vizinho.id)
  if (err2) return { error: err2.message }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}

export async function atualizarProcessoTipo(id: string, nome: string, etapas: EtapaForm[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const nomeTrim = nome.trim()

  const { error: updateError } = await supabase
    .from('processo_tipos')
    .update({ nome: nomeTrim, etapas: etapas.map(etapa => etapa.nome.trim()) })
    .eq('id', id)

  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um tipo de processo com esse nome.' }
    return { error: updateError.message }
  }

  for (const etapa of etapas) {
    const novoNome = etapa.nome.trim()
    if (etapa.nomeOriginal && etapa.nomeOriginal !== novoNome) {
      const { error: renomearError } = await supabase.rpc('renomear_etapa_processo', {
        p_processo_tipo_id: id,
        p_nome_antigo: etapa.nomeOriginal,
        p_nome_novo: novoNome,
      })
      if (renomearError) return { error: renomearError.message }
    }
  }

  const { data: subetapasAtuais, error: subetapasAtuaisError } = await supabase
    .from('processo_subetapas')
    .select('id')
    .eq('processo_tipo_id', id)
  if (subetapasAtuaisError) return { error: subetapasAtuaisError.message }

  const idsFinais = new Set(etapas.flatMap(etapa => etapa.subetapas.map(sub => sub.id).filter((subId): subId is string => !!subId)))
  const idsParaRemover = (subetapasAtuais ?? []).map(s => s.id as string).filter(subId => !idsFinais.has(subId))

  if (idsParaRemover.length > 0) {
    const { error: removerError } = await supabase.from('processo_subetapas').delete().in('id', idsParaRemover)
    if (removerError) return { error: removerError.message }
  }

  for (const etapa of etapas) {
    const novoNomeEtapa = etapa.nome.trim()
    for (const [subIndex, sub] of etapa.subetapas.entries()) {
      if (sub.id) {
        const { error: subUpdateError } = await supabase
          .from('processo_subetapas')
          .update({ nome: sub.nome, tipo_resposta: sub.tipoResposta, etapa_nome: novoNomeEtapa, ordem: subIndex })
          .eq('id', sub.id)
        if (subUpdateError) return { error: subUpdateError.message }
      } else {
        const { error: subInsertError } = await supabase.from('processo_subetapas').insert({
          processo_tipo_id: id,
          etapa_nome: novoNomeEtapa,
          nome: sub.nome,
          tipo_resposta: sub.tipoResposta,
          ordem: subIndex,
        })
        if (subInsertError) return { error: subInsertError.message }
      }
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
