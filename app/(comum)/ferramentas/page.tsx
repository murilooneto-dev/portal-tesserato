import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FerramentasClient from './FerramentasClient'

export const metadata = { title: 'Ferramentas — Tesserato Fiscal' }

export default async function FerramentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome,role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  let q = supabase.from('clientes').select('*').order('nome')
  if (!isAdmin && profile?.nome) q = q.ilike('responsavel', profile.nome)

  const { data: clientes } = await q

  return (
    <FerramentasClient
      clientes={clientes ?? []}
      isAdmin={isAdmin}
      userNome={profile?.nome ?? ''}
    />
  )
}
