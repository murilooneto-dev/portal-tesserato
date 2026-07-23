'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente } from '@/lib/supabase/server'

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
  revalidatePath('/fiscal/historico')
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

export async function atualizarSubEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  campo: 'recebido' | 'importado' | 'conferido',
  valor: boolean,
) {
  if (!(await podeEditarCliente(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas')
    .select('id, recebido, importado, conferido')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo)
    .maybeSingle()

  const atual = {
    recebido: existing?.recebido ?? false,
    importado: existing?.importado ?? false,
    conferido: existing?.conferido ?? false,
    [campo]: valor,
  }
  const todasMarcadas = atual.recebido && atual.importado && atual.conferido

  const payload = {
    ...atual,
    concluida: todasMarcadas,
    concluida_em: todasMarcadas ? new Date().toISOString() : null,
  }

  if (existing?.id) {
    await supabase.from('tarefas').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, ...payload })
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/historico')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}

export async function excluirCliente(id: string) {
  if (!(await podeEditarCliente(id))) throw new Error('Não autorizado')
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/clientes')
}
