import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSection } from '@/lib/admin-auth/server'
import SairAdminButton from '@/components/admin/SairAdminButton'
import ConfiguracoesClient from './ConfiguracoesClient'

export const metadata = { title: 'Configurações — Tesserato' }

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  // Guarda autoritativa da seção ADMIN — mesmo padrão de
  // app/fiscal/parametros/page.tsx.
  await requireAdminSection('/admin/configuracoes')

  return (
    <>
      <SairAdminButton />
      <ConfiguracoesClient />
    </>
  )
}
