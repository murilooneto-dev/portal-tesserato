'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { agruparExclusoes, type ExclusaoAgrupada, type LinhaLixeira } from '@/lib/lixeira'

// Lixeira é só para admin. Erro esperado volta como valor (doc do Next), não como throw.
async function exigirAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Acesso negado.' as const }
  return { error: null, user, supabase }
}

export async function listarExclusoes(): Promise<{ data: ExclusaoAgrupada[]; error: string | null }> {
  const ctx = await exigirAdmin()
  if (ctx.error !== null) return { data: [], error: ctx.error }

  // Limpeza best-effort do que expirou (60 dias); falha aqui não impede a listagem.
  await ctx.supabase.rpc('lixeira_limpar')

  // A função SQL devolve só "campos" para o título; o conteúdo (content_base64) nunca trafega.
  const { data, error } = await ctx.supabase.rpc('lixeira_listar', { p_limite: 3000 })
  if (error) return { data: [], error: error.message }
  const linhas = (data ?? []) as LinhaLixeira[]

  const ids = Array.from(new Set(linhas.map(l => l.excluido_por).filter((x): x is string => !!x)))
  const nomes: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: perfis } = await ctx.supabase.from('profiles').select('id, nome').in('id', ids)
    for (const p of perfis ?? []) nomes[p.id as string] = (p.nome as string) ?? ''
  }

  return { data: agruparExclusoes(linhas, new Date(), nomes).slice(0, 200), error: null }
}

const ROTAS_A_ATUALIZAR = [
  '/admin/lixeira', '/clientes', '/fiscal/clientes', '/contabil/clientes', '/pessoal/clientes',
  '/societario/clientes', '/financeiro/clientes', '/fiscal/parcelamentos',
]

export async function restaurarExclusao(
  grupo: number,
): Promise<{ error: string | null; resumo?: Record<string, number> }> {
  const ctx = await exigirAdmin()
  if (ctx.error !== null) return { error: ctx.error }
  if (!Number.isSafeInteger(grupo) || grupo <= 0) return { error: 'Exclusão inválida.' }

  const { data, error } = await ctx.supabase.rpc('lixeira_restaurar', { p_grupo: grupo, p_usuario: ctx.user.id })
  if (error) return { error: error.message }

  for (const rota of ROTAS_A_ATUALIZAR) revalidatePath(rota)
  const resumo = (data as { restaurado?: Record<string, number> } | null)?.restaurado
  return { error: null, resumo }
}
