'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buscarDonoNomePorTipo } from '@/lib/tarefa-tipo-donos'

// A RLS de profiles só deixa o usuário comum ler o próprio perfil, então com o
// client dele o nome do dono de cada tipo volta vazio e nenhum tipo é filtrado
// do progresso (Operador via tarefa de outro usuário no % do cliente). Aqui o
// nome é resolvido com o client admin; sai só o mapa tipo -> nome do dono.
export async function buscarDonoNomePorTipoFiscal(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  return buscarDonoNomePorTipo(createAdminClient(), 'fiscal')
}
