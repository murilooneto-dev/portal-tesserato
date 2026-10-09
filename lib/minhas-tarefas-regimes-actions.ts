'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { limparRegimes } from '@/lib/minhas-tarefas-regimes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Grava os regimes que um usuário atende em Minhas Tarefas do Fiscal. Só o
// admin define, na ficha do usuário em Parâmetros; usuário comum é recusado
// mesmo para o próprio id (a RLS da tabela repete a regra). Lista vazia =
// atende todos os regimes.
export async function salvarRegimesDoUsuario(
  userId: string,
  regimes: string[],
): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Sessão expirada. Entre de novo.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }
  if (typeof userId !== 'string' || !UUID.test(userId)) return { error: 'Usuário inválido.' }

  const { error } = await supabase.from('minhas_tarefas_regimes').upsert(
    { user_id: userId, setor: 'fiscal', regimes: limparRegimes(regimes), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,setor' },
  )
  if (error) {
    console.error('salvarRegimesDoUsuario:', error)
    return { error: 'Não foi possível salvar os regimes. Tente de novo.' }
  }

  // Muda quem vê e marca a tarefa em todo o Fiscal (ficha, listagem, Tarefas, dashboard).
  revalidatePath('/fiscal', 'layout')
  return { error: null }
}
