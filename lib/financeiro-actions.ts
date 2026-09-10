'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, createClient } from './supabase/server'
import { validarNomeEntidade, normalizarNome } from './config-entidades'
import type { FinanceiroNatureza, FinanceiroTipo, FinanceiroCentroCusto } from './types'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

// ---------- financeiro_tipos ----------

export async function listarFinanceiroTipos(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroTipo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('financeiro_tipos')
    .select('id, natureza, nome, ativo')
    .eq('natureza', natureza)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as FinanceiroTipo[], error: null }
}

export async function criarFinanceiroTipo(
  natureza: FinanceiroNatureza,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from('financeiro_tipos').select('nome').eq('natureza', natureza)
  if ((existentes ?? []).some(e => normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um tipo equivalente a esse nome.' }
  }

  const { error: insertError } = await supabase.from('financeiro_tipos').insert({ natureza, nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um tipo com esse nome.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function renomearFinanceiroTipo(id: string, nome: string): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: atual } = await supabase.from('financeiro_tipos').select('natureza').eq('id', id).single()
  if (atual) {
    const nomeNormalizado = normalizarNome(nome)
    const { data: existentes } = await supabase.from('financeiro_tipos').select('id, nome').eq('natureza', atual.natureza)
    if ((existentes ?? []).some(e => e.id !== id && normalizarNome(e.nome) === nomeNormalizado)) {
      return { error: 'Já existe um tipo equivalente a esse nome.' }
    }
  }

  const { error: updateError } = await supabase.from('financeiro_tipos').update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um tipo com esse nome.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function alternarAtivoFinanceiroTipo(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('financeiro_tipos').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function excluirFinanceiroTipo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { count } = await supabase.from('financeiro_movimentos').select('id', { count: 'exact', head: true }).eq('tipo_id', id)
  if ((count ?? 0) > 0) {
    return { error: `Não é possível excluir: em uso por ${count} movimento(s). Desative em vez de excluir.` }
  }

  const { error: deleteError } = await supabase.from('financeiro_tipos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

// ---------- financeiro_centros_custo ----------

export async function listarFinanceiroCentrosCusto(): Promise<{ data: FinanceiroCentroCusto[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('financeiro_centros_custo')
    .select('id, nome, ativo')
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as FinanceiroCentroCusto[], error: null }
}

export async function criarFinanceiroCentroCusto(nome: string): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from('financeiro_centros_custo').select('nome')
  if ((existentes ?? []).some(e => normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um centro de custo equivalente a esse nome.' }
  }

  const { error: insertError } = await supabase.from('financeiro_centros_custo').insert({ nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um centro de custo com esse nome.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function renomearFinanceiroCentroCusto(id: string, nome: string): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from('financeiro_centros_custo').select('id, nome')
  if ((existentes ?? []).some(e => e.id !== id && normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um centro de custo equivalente a esse nome.' }
  }

  const { error: updateError } = await supabase.from('financeiro_centros_custo').update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um centro de custo com esse nome.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function alternarAtivoFinanceiroCentroCusto(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('financeiro_centros_custo').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function excluirFinanceiroCentroCusto(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { count } = await supabase.from('financeiro_movimentos').select('id', { count: 'exact', head: true }).eq('centro_custo_id', id)
  if ((count ?? 0) > 0) {
    return { error: `Não é possível excluir: em uso por ${count} movimento(s). Desative em vez de excluir.` }
  }

  const { error: deleteError } = await supabase.from('financeiro_centros_custo').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

// ---------- financeiro_movimentos ----------

// Leitura/escrita de movimentos não passa por exigirAdmin(): qualquer usuário
// com 'financeiro' em profiles.setores pode lançar (RLS da migration 042 já
// restringe isso no banco). Só precisamos confirmar que há um usuário logado.

export async function listarFinanceiroTiposAtivos(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroTipo[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('financeiro_tipos')
    .select('id, natureza, nome, ativo')
    .eq('natureza', natureza)
    .eq('ativo', true)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as FinanceiroTipo[], error: null }
}

export async function listarFinanceiroCentrosCustoAtivos(): Promise<{ data: FinanceiroCentroCusto[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('financeiro_centros_custo')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as FinanceiroCentroCusto[], error: null }
}

export async function criarMovimento(input: {
  natureza: FinanceiroNatureza
  tipoId: string
  centroCustoId: string | null
  valor: number
  data: string
  observacao: string | null
}): Promise<{ id: string } | { error: string }> {
  if (!input.tipoId) return { error: 'Selecione o tipo.' }
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const { data: novo, error } = await supabase.from('financeiro_movimentos').insert({
    natureza: input.natureza,
    tipo_id: input.tipoId,
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data: input.data,
    observacao: input.observacao,
    criado_por: user.id,
  }).select('id').single()

  if (error || !novo) return { error: error?.message ?? 'Falha ao criar movimento.' }

  revalidatePath(input.natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { id: novo.id }
}

export async function excluirMovimento(id: string, natureza: FinanceiroNatureza): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('financeiro_movimentos').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}
