import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listarExclusoes } from '@/lib/lixeira-actions'
import LixeiraClient from './LixeiraClient'

export const metadata = { title: 'Lixeira — Tesserato' }

export default async function LixeiraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  const { data, error } = await listarExclusoes()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <LixeiraClient exclusoesIniciais={data} erroInicial={error} />
    </div>
  )
}
