import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  const { mes, ano } = await getMesAno()

  let clientesQ = supabase.from('clientes').select('*').order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('responsavel', profile.nome)

  const [{ data: clientes }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes ?? []) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  // Progresso por cliente
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [id, tipos] of Object.entries(tiposMap)) {
    progressoMap[id] = { total: tipos.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes ?? []}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        templates={templatesMap}
      />
    </div>
  )
}
