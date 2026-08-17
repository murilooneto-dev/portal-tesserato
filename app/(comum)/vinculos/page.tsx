import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VinculosClient from './VinculosClient'
import type { TarefaVinculo } from '@/lib/types'

export const metadata = { title: 'Vínculos de Tarefas — Tesserato' }

export default async function VinculosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  const [{ data: vinculosRaw }, { data: fiscalRows }, { data: contabilRows }, { data: pessoalRows }] = await Promise.all([
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
    supabase.from('clientes_fiscal').select('tarefas_personalizadas'),
    supabase.from('clientes_contabil').select('tarefas_personalizadas'),
    supabase.from('clientes_pessoal').select('tarefas_personalizadas'),
  ])

  const vinculos = (vinculosRaw ?? []) as TarefaVinculo[]

  const tiposPorSetor: Record<string, string[]> = {
    fiscal: Array.from(new Set((fiscalRows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[]))).sort(),
    contabil: Array.from(new Set((contabilRows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[]))).sort(),
    pessoal: Array.from(new Set((pessoalRows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[]))).sort(),
    societario: [],
    financeiro: [],
  }

  return (
    <>
      <div className="p-8 max-w-4xl mx-auto">
        <VinculosClient vinculosIniciais={vinculos} tiposPorSetor={tiposPorSetor} />
      </div>
    </>
  )
}
