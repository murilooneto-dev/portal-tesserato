'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor } from '@/lib/types'
import { validarNomeEntidade, normalizarNome } from '@/lib/config-entidades'

export type TipoEntidade = 'regimes' | 'grupos' | 'atividades'

// Server Actions são chamáveis diretamente por uma requisição forjada —
// os tipos do TypeScript são apagados em runtime, então `tabela` chega aqui
// como uma string qualquer, não garantidamente um TipoEntidade. Como
// getAuthenticatedAdmin() retorna um client service-role (bypassa RLS), sem
// essa checagem um `tabela` malicioso poderia atingir .from('profiles') ou
// .from('clientes') em vez de regimes/grupos/atividades.
const TABELAS_VALIDAS: readonly TipoEntidade[] = ['regimes', 'grupos', 'atividades']

export interface EntidadeConfig {
  id: string
  setor: UserSetor
  nome: string
  ativo: boolean
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
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
  if (!TABELAS_VALIDAS.includes(tabela)) return { data: [], error: 'Tabela inválida.' }

  // Leitura não exige checar profiles.role = 'admin' (RLS já libera pra
  // qualquer autenticado) — mas a tela em si vive atrás dessa checagem de
  // role, então manter a mesma checagem aqui simplifica (uma função só,
  // sem dois caminhos).
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
  if (!TABELAS_VALIDAS.includes(tabela)) return { error: 'Tabela inválida.' }

  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  // unique(setor, nome) no banco é sensível a maiúsculas/acentos — "Isentos"
  // e "isentos" coexistiriam. normalizarNome() já é usada em outros pontos
  // do repo pra esse mesmo tipo de comparação; checamos aqui na aplicação
  // em vez de tentar replicar a normalização num índice funcional do Postgres.
  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from(tabela).select('nome').eq('setor', setor)
  if ((existentes ?? []).some(e => normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um item equivalente a esse nome nesse setor.' }
  }

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
  if (!TABELAS_VALIDAS.includes(tabela)) return { error: 'Tabela inválida.' }

  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: atual } = await supabase.from(tabela).select('setor').eq('id', id).single()
  if (atual) {
    const nomeNormalizado = normalizarNome(nome)
    const { data: existentes } = await supabase.from(tabela).select('id, nome').eq('setor', atual.setor)
    if ((existentes ?? []).some(e => e.id !== id && normalizarNome(e.nome) === nomeNormalizado)) {
      return { error: 'Já existe um item equivalente a esse nome nesse setor.' }
    }
  }

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
  if (!TABELAS_VALIDAS.includes(tabela)) return { error: 'Tabela inválida.' }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from(tabela).update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
