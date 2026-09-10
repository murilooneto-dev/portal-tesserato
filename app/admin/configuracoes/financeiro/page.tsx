import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FinanceiroConfigClient from './FinanceiroConfigClient'

export const metadata = { title: 'Configurações — Financeiro — Tesserato' }

export default async function ConfiguracoesFinanceiroPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  return <FinanceiroConfigClient />
}
