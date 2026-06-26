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

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()

  const clientesQ = supabase.from('clientes').select('*').order('nome')

  const [{ data: clientes }, { data: tarefas }] = await Promise.all([
    clientesQ,
    supabase.from('tarefas').select('cliente_id').eq('mes', mes).eq('ano', ano),
  ])

  // Conta tarefas por cliente no mês atual
  const contagemTarefas: Record<string, number> = {}
  for (const t of tarefas ?? []) {
    contagemTarefas[t.cliente_id] = (contagemTarefas[t.cliente_id] ?? 0) + 1
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <EmpresasClient clientes={clientes ?? []} contagemTarefas={contagemTarefas} profileNome={profile?.nome ?? null} isAdmin={isAdmin} />
    </div>
  )
}
