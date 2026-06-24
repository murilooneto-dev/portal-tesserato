import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsuarios from '@/components/fiscal/AdminUsuarios'

export const metadata = { title: 'Admin — Tesserato Fiscal' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/fiscal/intranet')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('nome')

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Administração</h1>
        <p className="text-white/40 mt-1 text-sm">Usuários cadastrados no portal</p>
      </div>
      <AdminUsuarios profiles={profiles ?? []} />
    </div>
  )
}
