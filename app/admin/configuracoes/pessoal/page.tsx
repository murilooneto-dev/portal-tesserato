import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SetorConfigClient from '../_tarefas/SetorConfigClient'

export const metadata = { title: 'Configurações — Pessoal — Tesserato' }

export default async function ConfiguracoesPessoalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <SetorConfigClient setor="pessoal" />
}
