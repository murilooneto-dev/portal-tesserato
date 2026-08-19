'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'

// Diferente de excluirCliente (app/fiscal/clientes/actions.ts), que também
// libera o responsável do cliente via podeEditarCliente() — aqui, na tela
// geral COMUM que lista clientes de todos os setores, só admin pode
// excluir. `clientes` tem on delete cascade pras linhas de
// clientes_fiscal/contabil/pessoal e tudo que referencia o cliente
// (tarefas, parcelamentos, arquivos, tarefas_avulsas etc.) — excluir aqui
// remove o cliente do sistema inteiro, não só de um setor.
export async function excluirClienteGeral(id: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/clientes')
  return { error: null }
}
