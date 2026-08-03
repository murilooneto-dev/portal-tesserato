import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSection } from '@/lib/admin-auth/server'
import VinculosClient from './VinculosClient'
import type { TarefaVinculo } from '@/lib/types'

export const metadata = { title: 'Vínculos de Tarefas — Tesserato' }

export default async function VinculosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  // Guarda autoritativa da seção ADMIN (RNF2/RN1/CA5) — o proxy.ts já
  // intercepta a navegação, mas a verificação aqui, antes de qualquer
  // query, é a que realmente protege os dados desta página.
  await requireAdminSection('/vinculos')

  const [{ data: vinculosRaw }, { data: fiscalRows }, { data: contabilRows }] = await Promise.all([
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
    supabase.from('clientes_fiscal').select('tarefas_personalizadas'),
    supabase.from('clientes_contabil').select('tarefas_personalizadas'),
  ])

  const vinculos = (vinculosRaw ?? []) as TarefaVinculo[]

  const tiposPorSetor: Record<string, string[]> = {
    fiscal: Array.from(new Set((fiscalRows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[]))).sort(),
    contabil: Array.from(new Set((contabilRows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[]))).sort(),
    pessoal: [],
    societario: [],
    financeiro: [],
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <VinculosClient vinculosIniciais={vinculos} tiposPorSetor={tiposPorSetor} />
    </div>
  )
}
