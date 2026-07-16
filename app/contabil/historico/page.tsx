import { createClient } from '@/lib/supabase/server'
import HistoricoContabil from '@/components/contabil/HistoricoContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Histórico — Tesserato Contábil' }

export default async function HistoricoContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }

  const isAdmin = profile?.role === 'admin'

  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('clientes_contabil.responsavel', profile.nome)

  const { data: clientesRaw } = await clientesQ
  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const ids = clientes.map(c => c.id)

  let tarefas: Tarefa[] = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .eq('ano', ano)
      .eq('setor', 'contabil')
      .in('cliente_id', ids)
      .limit(10000)
    tarefas = (data ?? []) as Tarefa[]
  }

  return (
    <HistoricoContabil
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
    />
  )
}
