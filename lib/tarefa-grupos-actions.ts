'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente, podeEditarClienteContabil, podeEditarClientePessoal } from '@/lib/supabase/server'
import type { UserSetor, TarefaGrupo } from '@/lib/types'

const PODE_EDITAR_POR_SETOR: Record<UserSetor, (clienteId: string) => Promise<boolean>> = {
  fiscal: podeEditarCliente,
  contabil: podeEditarClienteContabil,
  pessoal: podeEditarClientePessoal,
  // Societário e Financeiro ainda não têm agrupamento de tarefas — cai no
  // mesmo bloqueio de "sem permissão" se algum dia chegar aqui por engano.
  societario: async () => false,
  financeiro: async () => false,
}

function revalidarFichaCliente(setor: UserSetor, clienteId: string) {
  revalidatePath(`/${setor}/clientes/${clienteId}`)
}

export async function listarGruposCliente(
  clienteId: string,
  setor: UserSetor,
): Promise<{ data: TarefaGrupo[]; error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { data: [], error: 'Sessão inválida.' }

  const { data, error } = await supabase
    .from('tarefa_grupos')
    .select('id, cliente_id, setor, nome, tarefas')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as TarefaGrupo[], error: null }
}

export async function criarGrupoTarefas(
  clienteId: string,
  setor: UserSetor,
  nome: string,
  tarefas: string[],
): Promise<{ error: string | null }> {
  if (!(await PODE_EDITAR_POR_SETOR[setor](clienteId))) return { error: 'Sem permissão pra editar esse cliente.' }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('tarefa_grupos')
    .insert({ cliente_id: clienteId, setor, nome: nomeTrim, tarefas })

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    return { error: error.message }
  }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}

export async function atualizarGrupoTarefas(
  grupoId: string,
  clienteId: string,
  setor: UserSetor,
  nome: string,
  tarefas: string[],
): Promise<{ error: string | null }> {
  if (!(await PODE_EDITAR_POR_SETOR[setor](clienteId))) return { error: 'Sem permissão pra editar esse cliente.' }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('tarefa_grupos')
    .update({ nome: nomeTrim, tarefas })
    .eq('id', grupoId)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    return { error: error.message }
  }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}

export async function excluirGrupoTarefas(
  grupoId: string,
  clienteId: string,
  setor: UserSetor,
): Promise<{ error: string | null }> {
  if (!(await PODE_EDITAR_POR_SETOR[setor](clienteId))) return { error: 'Sem permissão pra editar esse cliente.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase.from('tarefa_grupos').delete().eq('id', grupoId)
  if (error) return { error: error.message }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}
