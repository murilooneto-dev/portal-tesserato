import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FinanceiroConfigClient from './FinanceiroConfigClient'

export const metadata = { title: 'Configurações — Financeiro — Tesserato' }

export default async function ConfiguracoesFinanceiroPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <FinanceiroConfigClient />
}
