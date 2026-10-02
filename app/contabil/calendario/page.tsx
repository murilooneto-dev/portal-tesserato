// app/contabil/calendario/page.tsx
import { createClient } from '@/lib/supabase/server'
import CalendarioSetor from '@/components/calendario/CalendarioSetor'
import type { CalendarioEvento } from '@/lib/types'

export const metadata = { title: 'Calendário — Tesserato Contábil' }

export default async function CalendarioContabilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: eventosRaw }, { data: profile }] = await Promise.all([
    supabase.from('calendario_eventos').select('*').eq('setor', 'contabil').order('titulo'),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const eventos = (eventosRaw ?? []) as CalendarioEvento[]
  const isAdmin = profile?.role === 'admin'

  return <CalendarioSetor setor="contabil" eventos={eventos} isAdmin={isAdmin} />
}
