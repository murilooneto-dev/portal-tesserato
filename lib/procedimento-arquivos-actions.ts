'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from './supabase/server'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from './anexos'

export async function uploadArquivoProcedimento(
  procedimentoId: string,
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

  const { error } = await supabase.from('procedimento_arquivos').insert({
    procedimento_id: procedimentoId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidatePath('/societario/procedimentos')
  revalidatePath('/societario/clientes')
  return { error: null }
}

export async function excluirArquivoProcedimento(arquivoId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const { error } = await supabase.from('procedimento_arquivos').delete().eq('id', arquivoId)
  if (error) return { error: error.message }

  revalidatePath('/societario/procedimentos')
  revalidatePath('/societario/clientes')
  return { error: null }
}
