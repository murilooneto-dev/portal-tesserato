import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EmpresasClient from './EmpresasClient'

export const metadata = { title: 'Empresas — Tesserato Fiscal' }

export default async function EmpresasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const [{ data: clientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  const contagemTarefas: Record<string, number> = {}
  for (const c of clientes ?? []) {
    contagemTarefas[c.id] = (c.tarefas_personalizadas?.length ?? 0)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <EmpresasClient clientes={clientes ?? []} contagemTarefas={contagemTarefas} profileNome={profile?.nome ?? null} isAdmin={isAdmin} templates={templatesMap} />
    </div>
  )
}
