'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente, podeEditarClienteContabil, podeEditarClientePessoal } from '@/lib/supabase/server'
import { setorValido } from '@/lib/route-permissions'
import { registrarEventoTarefas } from '@/lib/logs'
import type { DetalhesTarefas } from '@/lib/logs-tarefas'
import type { UserSetor, TarefaGrupo } from '@/lib/types'

const PODE_EDITAR_POR_SETOR: Record<UserSetor, (clienteId: string) => Promise<boolean>> = {
  fiscal: podeEditarCliente,
  contabil: podeEditarClienteContabil,
  pessoal: podeEditarClientePessoal,
  // Societário, Financeiro e Configurações não têm agrupamento de tarefas
  // por cliente — cai no mesmo bloqueio de "sem permissão" se algum dia
  // chegar aqui por engano.
  societario: async () => false,
  financeiro: async () => false,
  configuracoes: async () => false,
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

// Usuário e cliente resolvidos no servidor (nunca vindos do navegador).
async function logGrupo(supabase: SupabaseAdmin, userId: string, clienteId: string, setor: UserSetor, detalhes: DetalhesTarefas) {
  const [{ data: perfil }, { data: cliente }] = await Promise.all([
    supabase.from('profiles').select('nome').eq('id', userId).single(),
    supabase.from('clientes').select('nome').eq('id', clienteId).single(),
  ])
  await registrarEventoTarefas(supabase, {
    setor, clienteId, clienteNome: cliente?.nome ?? '—',
    usuarioId: userId, usuarioNome: perfil?.nome ?? 'Desconhecido',
    detalhes,
  })
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

export async function listarGruposDoSetor(
  setor: UserSetor,
): Promise<{ data: Pick<TarefaGrupo, 'nome' | 'tarefas'>[]; error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { data: [], error: 'Sessão inválida.' }

  const { data, error } = await supabase
    .from('tarefa_grupos')
    .select('nome, tarefas')
    .eq('setor', setor)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as Pick<TarefaGrupo, 'nome' | 'tarefas'>[], error: null }
}

async function verificarPermissao(setor: string, clienteId: string): Promise<string | null> {
  if (!setorValido(setor)) return 'Setor inválido.'
  if (!(await PODE_EDITAR_POR_SETOR[setor](clienteId))) return 'Sem permissão pra editar esse cliente.'
  return null
}

export async function criarGrupoTarefas(
  clienteId: string,
  setor: UserSetor,
  nome: string,
  tarefas: string[],
): Promise<{ error: string | null }> {
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('tarefa_grupos')
    .insert({ cliente_id: clienteId, setor, nome: nomeTrim, tarefas })

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    return { error: error.message }
  }

  await logGrupo(supabase, user.id, clienteId, setor, { acao: 'grupo_criado', grupo: nomeTrim, tarefas })

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
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: grupoAntes } = await supabase.from('tarefa_grupos').select('nome, tarefas').eq('id', grupoId).eq('cliente_id', clienteId).eq('setor', setor).maybeSingle()

  // O grupo precisa pertencer ao MESMO cliente/setor já validados acima —
  // sem isso, um grupoId de outro cliente seria editado mesmo com a
  // permissão checada contra o cliente errado (IDOR).
  const { error } = await supabase
    .from('tarefa_grupos')
    .update({ nome: nomeTrim, tarefas })
    .eq('id', grupoId)
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    if (error.code === 'PGRST116') return { error: 'Grupo não encontrado pra esse cliente.' }
    return { error: error.message }
  }

  const mudou = !grupoAntes || grupoAntes.nome !== nomeTrim || JSON.stringify(grupoAntes.tarefas ?? []) !== JSON.stringify(tarefas)
  if (mudou) {
    await logGrupo(supabase, user.id, clienteId, setor, {
      acao: 'grupo_editado', grupo: nomeTrim, grupo_antigo: grupoAntes?.nome ?? undefined, tarefas,
    })
  }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}

export async function excluirGrupoTarefas(
  grupoId: string,
  clienteId: string,
  setor: UserSetor,
): Promise<{ error: string | null }> {
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: grupoAntes } = await supabase.from('tarefa_grupos').select('nome').eq('id', grupoId).eq('cliente_id', clienteId).eq('setor', setor).maybeSingle()

  const { error, count } = await supabase
    .from('tarefa_grupos')
    .delete({ count: 'exact' })
    .eq('id', grupoId)
    .eq('cliente_id', clienteId)
    .eq('setor', setor)

  if (error) return { error: error.message }
  if (!count) return { error: 'Grupo não encontrado pra esse cliente.' }

  await logGrupo(supabase, user.id, clienteId, setor, { acao: 'grupo_excluido', grupo: grupoAntes?.nome ?? undefined })

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}
