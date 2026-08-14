'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor } from '@/lib/types'
import { validarNomeEntidade } from '@/lib/config-entidades'

export type TipoEntidade = 'regimes' | 'grupos' | 'atividades'

export interface EntidadeConfig {
  id: string
  setor: UserSetor
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

export async function listarEntidades(
  tabela: TipoEntidade,
  setor: UserSetor,
): Promise<{ data: EntidadeConfig[]; error: string | null }> {
  // Leitura não exige a sessão ADMIN step-up (RLS já libera pra qualquer
  // autenticado) — mas a tela em si vive atrás de requireAdminSection, então
  // manter a mesma checagem aqui simplifica (uma função só, sem dois caminhos).
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from(tabela)
    .select('id, setor, nome, ativo')
    .eq('setor', setor)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as EntidadeConfig[], error: null }
}

export async function criarEntidade(
  tabela: TipoEntidade,
  setor: UserSetor,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: insertError } = await supabase.from(tabela).insert({ setor, nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um item com esse nome nesse setor.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function renomearEntidade(
  tabela: TipoEntidade,
  id: string,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from(tabela).update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um item com esse nome nesse setor.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function alternarAtivoEntidade(
  tabela: TipoEntidade,
  id: string,
  ativo: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from(tabela).update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
