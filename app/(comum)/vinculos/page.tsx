import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VinculosClient from './VinculosClient'
import type { TarefaVinculo } from '@/lib/types'
import { montarTiposPorSetor } from '@/lib/vinculos'

export const metadata = { title: 'Vínculos de Tarefas — Tesserato' }

export default async function VinculosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  const [{ data: vinculosRaw }, { data: fiscalRows }, { data: contabilRows }, { data: pessoalRows }, { data: catalogoRows }] = await Promise.all([
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
    supabase.from('clientes_fiscal').select('tarefas_personalizadas'),
    supabase.from('clientes_contabil').select('tarefas_personalizadas'),
    supabase.from('clientes_pessoal').select('tarefas_personalizadas'),
    supabase.from('tarefa_tipos').select('setor, nome'),
  ])

  const vinculos = (vinculosRaw ?? []) as TarefaVinculo[]

  const usadasPor = (rows: { tarefas_personalizadas: unknown }[] | null) =>
    (rows ?? []).flatMap(r => (r.tarefas_personalizadas ?? []) as string[])
  const tiposPorSetor = montarTiposPorSetor(
    (catalogoRows ?? []) as { setor: string; nome: string }[],
    { fiscal: usadasPor(fiscalRows), contabil: usadasPor(contabilRows), pessoal: usadasPor(pessoalRows) },
  )

  return (
    <>
      <div className="p-8 max-w-4xl mx-auto">
        <VinculosClient vinculosIniciais={vinculos} tiposPorSetor={tiposPorSetor} />
      </div>
    </>
  )
}
