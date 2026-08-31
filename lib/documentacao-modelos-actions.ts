'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from '@/lib/anexos'

export interface DocumentacaoModeloResumo {
  id: string
  nome: string
  size: number
  uploaded_at: string
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarDocumentacaoModelos(): Promise<{ data: DocumentacaoModeloResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('documentacao_modelos')
    .select('id, nome, size, uploaded_at')
    .order('uploaded_at', { ascending: false })

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as DocumentacaoModeloResumo[], error: null }
}

export async function criarDocumentacaoModelo(
  nome: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

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

  const { error: insertError } = await supabase.from('documentacao_modelos').insert({
    nome: nome.trim(),
    name: arquivo.name,
    content_base64: base64,
    size: arquivo.size,
  })
  if (insertError) return { error: insertError.message }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}

export async function excluirDocumentacaoModelo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: deleteError } = await supabase.from('documentacao_modelos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}
