import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SocietarioConfigClient from './SocietarioConfigClient'

export const metadata = { title: 'Configurações — Societário — Tesserato' }

export default async function ConfiguracoesSocietarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  return <SocietarioConfigClient />
}
