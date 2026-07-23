'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'

export async function criarLink(titulo: string, url: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { data: maiorOrdem } = await supabase
    .from('links_rapidos')
    .select('ordem')
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('links_rapidos').insert({
    titulo,
    url,
    ordem: (maiorOrdem?.ordem ?? -1) + 1,
  })

  if (error) return { error: error.message }
  revalidatePath('/intranet')
  return { error: null }
}

export async function atualizarLink(id: string, titulo: string, url: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase.from('links_rapidos').update({ titulo, url }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/intranet')
  return { error: null }
}

export async function excluirLink(id: string) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return

  await supabase.from('links_rapidos').delete().eq('id', id)
  revalidatePath('/intranet')
}
