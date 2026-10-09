'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { limparRegimes } from '@/lib/minhas-tarefas-regimes'

// Grava os regimes que o usuário atende em Minhas Tarefas do Fiscal. Cada um
// grava a própria linha; admin grava a de qualquer usuário (a RLS da tabela
// repete a mesma regra). Lista vazia = atende todos os regimes.
export async function salvarRegimesMinhasTarefas(
  userId: string,
  regimes: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Entre de novo.' }
  if (typeof userId !== 'string' || !userId) return { error: 'Usuário inválido.' }

  if (userId !== user.id) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return { error: 'Sem permissão para alterar os regimes de outro usuário.' }
  }

  const { error } = await supabase.from('minhas_tarefas_regimes').upsert(
    { user_id: userId, setor: 'fiscal', regimes: limparRegimes(regimes), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,setor' },
  )
  if (error) return { error: error.message }

  // Muda quem vê e marca a tarefa em todo o Fiscal (ficha, listagem, Tarefas, dashboard).
  revalidatePath('/fiscal', 'layout')
  return { error: null }
}
