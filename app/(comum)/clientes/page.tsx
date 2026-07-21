import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientesGeralLista from '@/components/geral/ClientesGeralLista'
import type { TarefaVinculo } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato' }

export default async function ClientesGeralPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: clientes }, { data: atividadeTemplates }, { data: usuariosFiscal }, { data: vinculosCatalogo }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
  ])

  const isAdmin = profile?.role === 'admin'

  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ClientesGeralLista
        clientes={clientes ?? []}
        isAdmin={isAdmin}
        responsaveis={responsaveis}
        templates={templatesMap}
        vinculosCatalogo={(vinculosCatalogo ?? []) as TarefaVinculo[]}
      />
    </div>
  )
}
