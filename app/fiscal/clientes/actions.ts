'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente } from '@/lib/supabase/server'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from '@/lib/anexos'

export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id').eq('id', tarefaId).single()
  if (!tarefa || !(await podeEditarCliente(tarefa.cliente_id))) return

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
    .eq('id', tarefaId)

  await supabase.from('task_unlock_log').insert({
    usuario_id: user?.id,
    usuario_nome: usuarioNome,
    cliente_id: null,
    cliente_nome: clienteNome,
    tarefa: tarefaTipo,
    competencia,
    valor_antigo: 'concluida',
    valor_novo: 'pendente',
    motivo,
  })

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}

export async function salvarMIT(clienteId: string, valor: string) {
  if (!(await podeEditarCliente(clienteId))) return
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase.from('clientes').update({ mit: valor }).eq('id', clienteId)
}

export async function salvarObs(clienteId: string, mes: number, ano: number, texto: string) {
  if (!(await podeEditarCliente(clienteId))) return
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase
    .from('observacoes_clientes')
    .upsert({ cliente_id: clienteId, mes, ano, texto }, { onConflict: 'cliente_id,mes,ano' })
}

const TIPOS_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]
const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

export async function uploadArquivo(clienteId: string, formData: FormData) {
  if (!(await podeEditarCliente(clienteId))) return { error: 'Não autorizado' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }

  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo) return { error: 'Nenhum arquivo' }

  if (!TIPOS_PERMITIDOS.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG ou XLSX.' }
  }
  if (arquivo.size > TAMANHO_MAX) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }

  const bytes = await arquivo.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const { data, error } = await supabase.from('client_files').insert({
    cliente_id: clienteId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  }).select('id, uploaded_at').single()

  if (!error) revalidatePath(`/fiscal/clientes/${clienteId}`)

  return { error: error?.message ?? null, id: data?.id ?? null, uploaded_at: data?.uploaded_at ?? null }
}

export async function excluirArquivo(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }
  const { data: arquivo } = await supabase.from('client_files').select('cliente_id').eq('id', arquivoId).single()
  if (!arquivo || !(await podeEditarCliente(arquivo.cliente_id))) return { error: 'Não autorizado' }
  const { error, count } = await supabase.from('client_files').delete({ count: 'exact' }).eq('id', arquivoId)
  if (error) return { error: error.message }
  if (!count) return { error: 'Arquivo não encontrado' }
  revalidatePath(`/fiscal/clientes/${arquivo.cliente_id}`)
  return { error: null }
}

export async function excluirCliente(id: string) {
  if (!(await podeEditarCliente(id))) throw new Error('Não autorizado')
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/clientes')
}

export async function atualizarEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  etapaNome: string,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarCliente(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null

  const { data: tarefaExistente } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()

  let tarefaId = tarefaExistente?.id as string | undefined
  if (!tarefaId) {
    const { data: novaTarefa } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida: false })
      .select('id')
      .single()
    tarefaId = novaTarefa?.id
  }
  if (!tarefaId) return

  const { data: etapaExistente } = await supabase
    .from('tarefa_etapas').select('id')
    .eq('tarefa_id', tarefaId).eq('nome', etapaNome)
    .maybeSingle()

  if (etapaExistente?.id) {
    await supabase.from('tarefa_etapas').update({ concluida, concluida_em }).eq('id', etapaExistente.id)
  } else {
    await supabase.from('tarefa_etapas').insert({ tarefa_id: tarefaId, nome: etapaNome, concluida, concluida_em })
  }

  const { data: tipoRow } = await supabase
    .from('tarefa_tipos').select('etapas')
    .eq('setor', 'fiscal').eq('nome', tipo)
    .maybeSingle()
  const etapasEsperadas: string[] = tipoRow?.etapas ?? []

  const { data: etapasAtuais } = await supabase
    .from('tarefa_etapas').select('nome, concluida')
    .eq('tarefa_id', tarefaId)

  const todasConcluidas = etapasEsperadas.length > 0 && etapasEsperadas.every(
    nome => (etapasAtuais ?? []).find(e => e.nome === nome)?.concluida === true
  )

  await supabase.from('tarefas').update({
    concluida: todasConcluidas,
    concluida_em: todasConcluidas ? new Date().toISOString() : null,
  }).eq('id', tarefaId)

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}

export async function salvarRespostaTexto(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  texto: string,
) {
  if (!(await podeEditarCliente(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida: false })
      .select('id')
      .single()
    tarefaId = nova?.id
  }
  if (!tarefaId) return

  const { count } = await supabase
    .from('tarefa_arquivos').select('id', { count: 'exact', head: true })
    .eq('tarefa_id', tarefaId)

  const textoTrimado = texto.trim()
  const concluida = textoTrimado !== '' || (count ?? 0) > 0

  await supabase.from('tarefas').update({
    resposta_texto: textoTrimado,
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', tarefaId)

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
}

export async function uploadArquivoTarefa(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  formData: FormData,
) {
  if (!(await podeEditarCliente(clienteId))) return { error: 'Não autorizado' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }

  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo) return { error: 'Nenhum arquivo' }
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX ou DOCX.' }
  }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida: false })
      .select('id')
      .single()
    tarefaId = nova?.id
  }
  if (!tarefaId) return { error: 'Falha ao criar tarefa' }

  const bytes = await arquivo.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const { error } = await supabase.from('tarefa_arquivos').insert({
    tarefa_id: tarefaId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  await supabase.from('tarefas').update({
    concluida: true,
    concluida_em: new Date().toISOString(),
  }).eq('id', tarefaId)

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  return { error: null }
}

export async function excluirArquivoTarefa(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: arquivo } = await supabase.from('tarefa_arquivos').select('tarefa_id').eq('id', arquivoId).single()
  if (!arquivo) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id, resposta_texto, setor').eq('id', arquivo.tarefa_id).single()
  if (!tarefa || tarefa.setor !== 'fiscal' || !(await podeEditarCliente(tarefa.cliente_id))) return

  await supabase.from('tarefa_arquivos').delete().eq('id', arquivoId)

  const { count } = await supabase
    .from('tarefa_arquivos').select('id', { count: 'exact', head: true })
    .eq('tarefa_id', arquivo.tarefa_id)

  const concluida = !!tarefa.resposta_texto?.trim() || (count ?? 0) > 0

  await supabase.from('tarefas').update({
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', arquivo.tarefa_id)

  revalidatePath(`/fiscal/clientes/${tarefa.cliente_id}`)
  revalidatePath('/fiscal/clientes')
}
