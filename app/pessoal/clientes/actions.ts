'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarClientePessoal } from '@/lib/supabase/server'
import { verificarSenhaUsuarioAtual } from '@/lib/verificar-senha'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from '@/lib/anexos'
import { gravarDataParcelamento, isoParaDdMm } from '@/lib/parcelamento-tarefas'
import { registrarEvento, abrirHistoricoResponsavel, trocarResponsavel } from '@/lib/logs'

interface ClientePayload {
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
  contato_chat: string | null
}

interface PessoalPayload {
  atividade: string[]
  regime: string | null
  responsavel: string | null
  prioridade: number
  tarefas_personalizadas: string[]
  tarefas_excluidas: string[]
}

async function nomeDoUsuario(supabase: Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase'], userId: string) {
  const { data } = await supabase!.from('profiles').select('nome').eq('id', userId).single()
  return data?.nome ?? 'Desconhecido'
}

export async function salvarClientePessoal(
  clienteId: string | null,
  clientePayload: ClientePayload,
  pessoalPayload: PessoalPayload,
): Promise<{ error?: string; id?: string }> {
  if (clienteId && !(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const usuarioNome = await nomeDoUsuario(supabase, user.id)

  if (clienteId) {
    const { data: antes } = await supabase.from('clientes_pessoal').select('responsavel').eq('cliente_id', clienteId).single()

    const { error: errCliente } = await supabase.from('clientes').update(clientePayload).eq('id', clienteId)
    if (errCliente) return { error: errCliente.message }
    const { error: errPessoal } = await supabase.from('clientes_pessoal').update(pessoalPayload).eq('cliente_id', clienteId)
    if (errPessoal) return { error: errPessoal.message }

    await trocarResponsavel(supabase, {
      clienteId, clienteNome: clientePayload.nome, setor: 'pessoal',
      responsavelAntigo: antes?.responsavel, responsavelNovo: pessoalPayload.responsavel,
      usuarioId: user.id, usuarioNome,
    })
  } else {
    const { data: novoCliente, error: errCliente } = await supabase.from('clientes')
      .insert({ ...clientePayload, setores: ['pessoal'] })
      .select('id').single()
    if (errCliente || !novoCliente) return { error: errCliente?.message ?? 'Falha ao criar cliente' }
    const { error: errPessoal } = await supabase.from('clientes_pessoal').insert({ cliente_id: novoCliente.id, ...pessoalPayload })
    if (errPessoal) return { error: errPessoal.message }

    await registrarEvento(supabase, {
      setor: 'pessoal', clienteId: novoCliente.id, clienteNome: clientePayload.nome,
      tipoEvento: 'criacao', usuarioId: user.id, usuarioNome,
    })
    if (pessoalPayload.responsavel) {
      await abrirHistoricoResponsavel(supabase, {
        clienteId: novoCliente.id, setor: 'pessoal', responsavel: pessoalPayload.responsavel,
        usuarioId: user.id, usuarioNome,
      })
    }
    clienteId = novoCliente.id
  }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  return { id: clienteId ?? undefined }
}

export async function toggleTarefaPessoal(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id, parcelamento_id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida, concluida_em })
  }

  if (existing?.parcelamento_id) {
    await gravarDataParcelamento(supabase, existing.parcelamento_id, mes, concluida && data ? isoParaDdMm(data) : null)
  }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/preenchimento-rapido')
}

// Marca a tarefa como concluída sem exigir data/etapas/texto — pra cliente
// que não teve movimento naquela tarefa no mês. Desmarcar é direto, sem
// motivo (Pessoal já não tem cerimônia de desbloqueio pra nada).
export async function marcarSemMovimento(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  semMovimento: boolean,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas').select('id, parcelamento_id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  const payload = semMovimento
    ? { sem_movimento: true, concluida: true, concluida_em: new Date().toISOString() }
    : { sem_movimento: false, concluida: false, concluida_em: null }

  if (existing?.id) {
    await supabase.from('tarefas').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', ...payload })
  }

  if (existing?.parcelamento_id) {
    await gravarDataParcelamento(supabase, existing.parcelamento_id, mes, null)
  }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/preenchimento-rapido')
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
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null

  const { data: tarefaExistente } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  let tarefaId = tarefaExistente?.id as string | undefined
  if (!tarefaId) {
    const { data: novaTarefa } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida: false })
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
    .eq('setor', 'pessoal').eq('nome', tipo)
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

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
}

export async function excluirClientePessoal(clienteId: string) {
  if (!(await podeEditarClientePessoal(clienteId))) throw new Error('Não autorizado')
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) throw new Error('Não autorizado')

  const { data: clienteAntes } = await supabase.from('clientes').select('nome, setores').eq('id', clienteId).single()
  const usuarioNome = await nomeDoUsuario(supabase, user.id)

  await supabase.from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', 'pessoal')
  await supabase.from('clientes_pessoal').delete().eq('cliente_id', clienteId)

  const novosSetores = (clienteAntes?.setores ?? []).filter((s: string) => s !== 'pessoal')
  const clienteRemovidoDoTodo = novosSetores.length === 0

  if (clienteRemovidoDoTodo) {
    await supabase.from('clientes').delete().eq('id', clienteId)
  } else {
    await supabase.from('clientes').update({ setores: novosSetores }).eq('id', clienteId)
  }

  await registrarEvento(supabase, {
    setor: 'pessoal', clienteId: clienteRemovidoDoTodo ? null : clienteId, clienteNome: clienteAntes?.nome ?? '—',
    tipoEvento: 'exclusao', usuarioId: user.id, usuarioNome,
  })

  revalidatePath('/pessoal/clientes')
}

export async function salvarRespostaTexto(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  texto: string,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida: false })
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

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
}

export async function uploadArquivoTarefa(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  formData: FormData,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado' }
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
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  let tarefaId = existing?.id as string | undefined
  if (!tarefaId) {
    const { data: nova } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida: false })
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

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  return { error: null }
}

export async function excluirArquivoTarefa(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: arquivo } = await supabase.from('tarefa_arquivos').select('tarefa_id').eq('id', arquivoId).single()
  if (!arquivo) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id, resposta_texto').eq('id', arquivo.tarefa_id).single()
  if (!tarefa || !(await podeEditarClientePessoal(tarefa.cliente_id))) return

  await supabase.from('tarefa_arquivos').delete().eq('id', arquivoId)

  const { count } = await supabase
    .from('tarefa_arquivos').select('id', { count: 'exact', head: true })
    .eq('tarefa_id', arquivo.tarefa_id)

  const concluida = !!tarefa.resposta_texto?.trim() || (count ?? 0) > 0

  await supabase.from('tarefas').update({
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', arquivo.tarefa_id)

  revalidatePath(`/pessoal/clientes/${tarefa.cliente_id}`)
  revalidatePath('/pessoal/clientes')
}

export async function salvarObsPessoal(clienteId: string, texto: string): Promise<{ error?: string }> {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Você não pode editar este cliente.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }
  const { error } = await supabase.from('clientes_pessoal').update({ obs: texto || null }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }
  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  return {}
}

export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }> {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado.' }

  const { ok, error: erroSenha } = await verificarSenhaUsuarioAtual(senha)
  if (!ok) return { error: erroSenha ?? 'Senha incorreta.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: cliente } = await supabase.from('clientes').select('nome').eq('id', clienteId).single()

  const { error } = await supabase.from('clientes_pessoal').update({ ativo: false }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  await registrarEvento(supabase, {
    setor: 'pessoal', clienteId, clienteNome: cliente?.nome ?? '—',
    tipoEvento: 'desabilitacao', usuarioId: user.id, usuarioNome: await nomeDoUsuario(supabase, user.id),
  })

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  revalidatePath('/pessoal/relatorios')
  return {}
}

export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: cliente } = await supabase.from('clientes').select('nome').eq('id', clienteId).single()

  const { error } = await supabase.from('clientes_pessoal').update({ ativo: true }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  await registrarEvento(supabase, {
    setor: 'pessoal', clienteId, clienteNome: cliente?.nome ?? '—',
    tipoEvento: 'reabilitacao', usuarioId: user.id, usuarioNome: await nomeDoUsuario(supabase, user.id),
  })

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  revalidatePath('/pessoal/relatorios')
  return {}
}
