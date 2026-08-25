'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarClienteContabil } from '@/lib/supabase/server'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from '@/lib/anexos'
import { verificarSenhaUsuarioAtual } from '@/lib/verificar-senha'

export async function toggleTarefaContabil(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClienteContabil(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida, concluida_em })
  }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/preenchimento-rapido')
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
  if (!(await podeEditarClienteContabil(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null

  // 1. Acha ou cria a linha de `tarefas` pro tipo (mês/ano/cliente/setor)
  const { data: tarefaExistente } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  let tarefaId = tarefaExistente?.id as string | undefined
  if (!tarefaId) {
    const { data: novaTarefa } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida: false })
      .select('id')
      .single()
    tarefaId = novaTarefa?.id
  }
  if (!tarefaId) return

  // 2. Acha ou cria a linha de `tarefa_etapas` pro nome da etapa
  const { data: etapaExistente } = await supabase
    .from('tarefa_etapas').select('id')
    .eq('tarefa_id', tarefaId).eq('nome', etapaNome)
    .maybeSingle()

  if (etapaExistente?.id) {
    await supabase.from('tarefa_etapas').update({ concluida, concluida_em }).eq('id', etapaExistente.id)
  } else {
    await supabase.from('tarefa_etapas').insert({ tarefa_id: tarefaId, nome: etapaNome, concluida, concluida_em })
  }

  // 3. Recalcula concluida da tarefa-pai: todas as etapas esperadas (de tarefa_tipos) concluídas?
  const { data: tipoRow } = await supabase
    .from('tarefa_tipos').select('etapas')
    .eq('setor', 'contabil').eq('nome', tipo)
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

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
}

export async function excluirClienteContabil(clienteId: string) {
  if (!(await podeEditarClienteContabil(clienteId))) throw new Error('Não autorizado')
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')

  // Apaga as tarefas do setor Contábil pra esse cliente (tarefa_etapas
  // cascateia via FK em tarefas.id, não precisa apagar manualmente).
  await supabase.from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', 'contabil')

  // Apaga os dados operacionais do Contábil.
  await supabase.from('clientes_contabil').delete().eq('cliente_id', clienteId)

  // Remove 'contabil' de clientes.setores. Se não sobrar nenhum setor,
  // a linha de clientes deixa de fazer sentido — apaga também.
  const { data: cliente } = await supabase.from('clientes').select('setores').eq('id', clienteId).single()
  const novosSetores = (cliente?.setores ?? []).filter((s: string) => s !== 'contabil')

  if (novosSetores.length === 0) {
    await supabase.from('clientes').delete().eq('id', clienteId)
  } else {
    await supabase.from('clientes').update({ setores: novosSetores }).eq('id', clienteId)
  }

  revalidatePath('/contabil/clientes')
}

export async function salvarRespostaTexto(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  texto: string,
) {
  if (!(await podeEditarClienteContabil(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida: false })
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

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
}

export async function uploadArquivoTarefa(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  formData: FormData,
) {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Não autorizado' }
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
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida: false })
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

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  return { error: null }
}

export async function excluirArquivoTarefa(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: arquivo } = await supabase.from('tarefa_arquivos').select('tarefa_id').eq('id', arquivoId).single()
  if (!arquivo) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id, resposta_texto').eq('id', arquivo.tarefa_id).single()
  if (!tarefa || !(await podeEditarClienteContabil(tarefa.cliente_id))) return

  await supabase.from('tarefa_arquivos').delete().eq('id', arquivoId)

  const { count } = await supabase
    .from('tarefa_arquivos').select('id', { count: 'exact', head: true })
    .eq('tarefa_id', arquivo.tarefa_id)

  const concluida = !!tarefa.resposta_texto?.trim() || (count ?? 0) > 0

  await supabase.from('tarefas').update({
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', arquivo.tarefa_id)

  revalidatePath(`/contabil/clientes/${tarefa.cliente_id}`)
  revalidatePath('/contabil/clientes')
}

export async function salvarObsContabil(clienteId: string, texto: string): Promise<{ error?: string }> {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Você não pode editar este cliente.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }
  const { error } = await supabase.from('clientes_contabil').update({ obs: texto || null }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }
  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/dashboard')
  return {}
}

export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }> {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Não autorizado.' }

  const { ok, error: erroSenha } = await verificarSenhaUsuarioAtual(senha)
  if (!ok) return { error: erroSenha ?? 'Senha incorreta.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_contabil').update({ ativo: false }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/dashboard')
  revalidatePath('/contabil/relatorios')
  return {}
}

export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Não autorizado.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_contabil').update({ ativo: true }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/dashboard')
  revalidatePath('/contabil/relatorios')
  return {}
}
