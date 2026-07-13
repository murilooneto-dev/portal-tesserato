// lib/get-portal-context.ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import type { Profile } from '@/lib/types'

export async function getPortalContext(): Promise<{ profile: Profile; mes: number; ano: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile: Profile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador',
    setores: ['fiscal'],
    cor: '#6366f1',
    created_at: new Date().toISOString(),
  }

  const { mes, ano } = await getMesAno()

  return { profile: safeProfile, mes, ano }
}
