import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClienteNota {
  id: string
  cliente_id: string
  setor: string
  texto: string
  usuario_id: string | null
  usuario_nome: string
  created_at: string
  updated_at: string | null
}

export async function buscarNotasCliente(
  supabase: SupabaseClient,
  clienteId: string,
  setor: 'contabil' | 'pessoal',
): Promise<ClienteNota[]> {
  const { data } = await supabase
    .from('cliente_notas')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .order('created_at', { ascending: false })
  return data ?? []
}
