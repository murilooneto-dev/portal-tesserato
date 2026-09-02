'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor, TipoResposta } from '@/lib/types'

export type TipoEntidadeVinculo = 'regime' | 'atividade'

const TABELA_POR_TIPO: Record<TipoEntidadeVinculo, 'regimes' | 'atividades'> = {
  regime: 'regimes',
  atividade: 'atividades',
}

export interface TarefaTipoResumo {
  id: string
  nome: string
  ativo: boolean
  responsavelId: string | null
  tipoResposta: TipoResposta
  etapas: string[] | null
}

export interface UsuarioDoSetor {
  id: string
  nome: string
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
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
    .select('id, nome, ativo, responsavel_id, tipo_resposta, etapas')
    .eq('setor', setor)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return {
    data: (data ?? []).map(t => ({
      id: t.id as string,
      nome: t.nome as string,
      ativo: t.ativo as boolean,
      responsavelId: t.responsavel_id as string | null,
      tipoResposta: (t.tipo_resposta as TipoResposta) ?? 'data',
      etapas: t.etapas as string[] | null,
    })),
    error: null,
  }
}

export async function listarUsuariosDoSetor(
  setor: UserSetor,
): Promise<{ data: UsuarioDoSetor[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('id, nome')
    .contains('setores', [setor])
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as UsuarioDoSetor[], error: null }
}

export async function atualizarResponsavelTarefaTipo(
  id: string,
  responsavelId: string | null,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase
    .from('tarefa_tipos').update({ responsavel_id: responsavelId }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  revalidatePath('/fiscal/minhas-tarefas')
  revalidatePath('/fiscal/tarefas')
  return { error: null }
}

// Só o formato (tipo_resposta/etapas) é editável — o nome fica fixo porque
// `tarefas.tipo` e `clientes_fiscal.tarefas_personalizadas` guardam esse
// nome como texto livre, sem FK; renomear aqui deixaria esses registros
// órfãos silenciosamente.
export async function atualizarFormatoTarefaTipo(
  id: string,
  tipoResposta: TipoResposta,
  etapas: string[] | null,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase
    .from('tarefa_tipos').update({ tipo_resposta: tipoResposta, etapas }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function alternarAtivoTarefaTipo(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('tarefa_tipos').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function excluirTarefaTipo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  // tarefa_tipo_vinculos.tarefa_tipo_id tem on delete cascade (migration
  // 025) — excluir aqui já remove os vínculos dessa tarefa junto.
  const { error: deleteError } = await supabase.from('tarefa_tipos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

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
    // Um feature futura (fora deste branch) lê esses vínculos pra gerar
    // tarefas de cliente — um vínculo órfão ou cruzando setor geraria dado
    // errado silenciosamente lá. Validamos aqui, na origem, que a entidade
    // existe na tabela certa e que seu setor bate com o do tarefa_tipo.
    const { data: tarefaTipo, error: tarefaTipoError } = await supabase
      .from('tarefa_tipos')
      .select('setor')
      .eq('id', tarefaTipoId)
      .single()
    if (tarefaTipoError || !tarefaTipo) return { error: 'Tipo de tarefa não encontrado.' }

    const tabelaEntidade = TABELA_POR_TIPO[entidadeTipo]
    const { data: entidade, error: entidadeError } = await supabase
      .from(tabelaEntidade)
      .select('setor')
      .eq('id', entidadeId)
      .single()
    if (entidadeError || !entidade) return { error: 'Entidade não encontrada.' }

    if (entidade.setor !== tarefaTipo.setor) {
      return { error: 'A entidade pertence a um setor diferente do tipo de tarefa.' }
    }

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

export interface VinculoAtividadeRegime {
  tarefaTipoId: string
  regimeId: string | null
}

// Igual a listarTarefaTipoIdsVinculados, mas só pra vínculos de atividade —
// traz junto o regime_id de cada um (null = "todos os regimes"), pra
// VincularTarefasModal.tsx pré-preencher o select de regime por tarefa.
export async function listarVinculosAtividadeComRegime(
  atividadeId: string,
): Promise<{ data: VinculoAtividadeRegime[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipo_vinculos')
    .select('tarefa_tipo_id, regime_id')
    .eq('entidade_tipo', 'atividade')
    .eq('entidade_id', atividadeId)

  if (queryError) return { data: [], error: queryError.message }
  return {
    data: (data ?? []).map(row => ({
      tarefaTipoId: row.tarefa_tipo_id as string,
      regimeId: row.regime_id as string | null,
    })),
    error: null,
  }
}

// Vínculo atividade+regime: no máximo 1 linha por par (tarefaTipoId,
// atividadeId) — trocar o regime apaga a linha anterior e insere a nova,
// em vez de depender de constraint única (null não colide com null em
// unique index do Postgres, então não dava pra confiar nisso aqui).
export async function definirVinculoAtividadeRegime(
  tarefaTipoId: string,
  atividadeId: string,
  regimeId: string | null,
  vincular: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: deleteError } = await supabase
    .from('tarefa_tipo_vinculos')
    .delete()
    .eq('tarefa_tipo_id', tarefaTipoId)
    .eq('entidade_tipo', 'atividade')
    .eq('entidade_id', atividadeId)
  if (deleteError) return { error: deleteError.message }

  if (vincular) {
    // Mesma validação de setor de alternarVinculo — a entidade (e o
    // regime, quando escolhido) precisam pertencer ao mesmo setor do tipo
    // de tarefa, senão o vínculo geraria dado errado silenciosamente no
    // cálculo de tarefas esperadas.
    const { data: tarefaTipo, error: tarefaTipoError } = await supabase
      .from('tarefa_tipos').select('setor').eq('id', tarefaTipoId).single()
    if (tarefaTipoError || !tarefaTipo) return { error: 'Tipo de tarefa não encontrado.' }

    const { data: atividade, error: atividadeError } = await supabase
      .from('atividades').select('setor').eq('id', atividadeId).single()
    if (atividadeError || !atividade) return { error: 'Atividade não encontrada.' }
    if (atividade.setor !== tarefaTipo.setor) {
      return { error: 'A atividade pertence a um setor diferente do tipo de tarefa.' }
    }

    if (regimeId) {
      const { data: regime, error: regimeError } = await supabase
        .from('regimes').select('setor').eq('id', regimeId).single()
      if (regimeError || !regime) return { error: 'Regime não encontrado.' }
      if (regime.setor !== tarefaTipo.setor) {
        return { error: 'O regime pertence a um setor diferente do tipo de tarefa.' }
      }
    }

    const { error: insertError } = await supabase
      .from('tarefa_tipo_vinculos')
      .insert({ tarefa_tipo_id: tarefaTipoId, entidade_tipo: 'atividade', entidade_id: atividadeId, regime_id: regimeId })
    if (insertError) return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
