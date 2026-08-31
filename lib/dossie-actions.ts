'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import type { StatusDossie } from './status-dossie'

// Dossiê é uma lista de trabalho compartilhada, não por cliente: qualquer
// usuário que já tem acesso à aba Dossiê (mesma regra de acesso da própria
// página /fiscal/minhas-tarefas — pelo menos um tarefa_tipos.responsavel_id
// seu no setor, ou admin) pode editar STATUS/FINALIZADO de QUALQUER cliente
// da lista. Não é gated pelo responsável geral do cliente — decisão
// explícita do usuário, diferente do resto do Fiscal.
async function podeAcessarDossie(): Promise<boolean> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return false

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') return true

  const { count } = await supabase
    .from('tarefa_tipos')
    .select('id', { count: 'exact', head: true })
    .eq('setor', 'fiscal').eq('responsavel_id', user.id)

  return (count ?? 0) > 0
}

export async function atualizarStatusDossie(clienteId: string, status: StatusDossie): Promise<{ error: string | null }> {
  if (!(await podeAcessarDossie())) return { error: 'Não autorizado.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_fiscal').update({ dossie_status: status }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath('/fiscal/minhas-tarefas')
  return { error: null }
}

export async function atualizarFinalizadoDossie(clienteId: string, finalizado: boolean): Promise<{ error: string | null }> {
  if (!(await podeAcessarDossie())) return { error: 'Não autorizado.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_fiscal').update({ dossie_finalizado: finalizado }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath('/fiscal/minhas-tarefas')
  return { error: null }
}
