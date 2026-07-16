'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from './supabase/server'
import type { TarefaAvulsa, UserSetor } from './types'

export interface TarefaAvulsaComCriador extends TarefaAvulsa {
  criado_por_nome: string | null
}

export async function buscarTarefasAvulsasDoMes(
  clienteId: string,
  setor: UserSetor,
  mes: number,
  ano: number,
): Promise<TarefaAvulsaComCriador[]> {
  const supabase = await createClient()
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('tarefas_avulsas')
    .select('*, profiles(nome)')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .gte('data', inicio)
    .lt('data', fim)
    .order('data')

  return (data ?? []).map(row => {
    const { profiles, ...resto } = row as unknown as { profiles: { nome: string } | null } & TarefaAvulsa
    return { ...resto, criado_por_nome: profiles?.nome ?? null }
  })
}

export async function criarTarefaAvulsa(input: {
  clienteId: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  data: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('tarefas_avulsas').insert({
    cliente_id: input.clienteId,
    setor: input.setor,
    titulo: input.titulo,
    descricao: input.descricao,
    data: input.data,
    criado_por: user.id,
  })

  revalidatePath(`/${input.setor}/clientes/${input.clienteId}`)
}

export async function toggleTarefaAvulsa(id: string, clienteId: string, setor: UserSetor, concluida: boolean) {
  const supabase = await createClient()
  await supabase.from('tarefas_avulsas').update({
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', id)

  revalidatePath(`/${setor}/clientes/${clienteId}`)
}

export async function excluirTarefaAvulsa(id: string, clienteId: string, setor: UserSetor) {
  const supabase = await createClient()
  await supabase.from('tarefas_avulsas').delete().eq('id', id)

  revalidatePath(`/${setor}/clientes/${clienteId}`)
}
