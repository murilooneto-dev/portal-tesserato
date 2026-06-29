'use server'

import { createClient } from '@/lib/supabase/server'

export async function toggleTarefa(tarefaId: string, concluida: boolean) {
  const supabase = await createClient()
  await supabase
    .from('tarefas')
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq('id', tarefaId)
}

export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null })
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
}

export async function salvarMIT(clienteId: string, valor: string) {
  const supabase = await createClient()
  await supabase.from('clientes').update({ mit: valor }).eq('id', clienteId)
}

export async function salvarObs(clienteId: string, obs: string) {
  const supabase = await createClient()
  await supabase.from('clientes').update({ obs }).eq('id', clienteId)
}

const TIPOS_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
]
const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

export async function uploadArquivo(clienteId: string, formData: FormData) {
  const supabase = await createClient()
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

  const { error } = await supabase.from('client_files').insert({
    cliente_id: clienteId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  })

  return { error: error?.message ?? null }
}

export async function excluirArquivo(arquivoId: string) {
  const supabase = await createClient()
  await supabase.from('client_files').delete().eq('id', arquivoId)
}
