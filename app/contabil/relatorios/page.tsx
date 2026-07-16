import { createClient } from '@/lib/supabase/server'
import RelatoriosContabil from '@/components/contabil/RelatoriosContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Relatórios — Tesserato Contábil' }

export default async function RelatoriosContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }

  const isAdmin = profile?.role === 'admin'

  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('clientes_contabil.responsavel', profile.nome)

  const [{ data: clientesRaw }, tarefas] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'contabil'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)

  return (
    <RelatoriosContabil
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
    />
  )
}
