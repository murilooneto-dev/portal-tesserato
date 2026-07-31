'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from './supabase/server'
import type { TarefaAvulsa, UserSetor, EventoArquivo } from './types'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from './anexos'

export interface TarefaAvulsaComCriador extends TarefaAvulsa {
  criado_por_nome: string | null
  arquivos: Omit<EventoArquivo, 'content_base64'>[]
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
    .select('*, profiles(nome), evento_arquivos(id, evento_id, name, size, uploaded_at)')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .gte('data', inicio)
    .lt('data', fim)
    .order('data')

  return (data ?? []).map(row => {
    const { profiles, evento_arquivos, ...resto } = row as unknown as {
      profiles: { nome: string } | null
      evento_arquivos: Omit<EventoArquivo, 'content_base64'>[]
    } & TarefaAvulsa
    return { ...resto, criado_por_nome: profiles?.nome ?? null, arquivos: evento_arquivos ?? [] }
  })
}

export async function criarTarefaAvulsa(input: {
  clienteId: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  data: string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const { data: novo, error } = await supabase.from('tarefas_avulsas').insert({
    cliente_id: input.clienteId,
    setor: input.setor,
    titulo: input.titulo,
    descricao: input.descricao,
    data: input.data,
    criado_por: user.id,
  }).select('id').single()

  if (error || !novo) return { error: error?.message ?? 'Falha ao criar evento' }

  revalidatePath(`/${input.setor}/clientes/${input.clienteId}`)
  return { id: novo.id }
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

export async function uploadArquivoEvento(
  eventoId: string,
  clienteId: string,
  setor: UserSetor,
  formData: FormData,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo) return { error: 'Nenhum arquivo' }
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX ou DOCX.' }
  }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }

  const bytes = await arquivo.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const { error } = await supabase.from('evento_arquivos').insert({
    evento_id: eventoId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidatePath(`/${setor}/clientes/${clienteId}`)
  return { error: null }
}

export async function excluirArquivoEvento(arquivoId: string, clienteId: string, setor: UserSetor) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('evento_arquivos').delete().eq('id', arquivoId)

  revalidatePath(`/${setor}/clientes/${clienteId}`)
}
