import { createClient } from '@/lib/supabase/server'
import HistoricoPessoal from '@/components/pessoal/HistoricoPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Histórico — Tesserato Pessoal' }

export default async function HistoricoPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }

  const isAdmin = profile?.role === 'admin'

  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('clientes_pessoal.responsavel', profile.nome)

  const { data: clientesRaw } = await clientesQ
  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const ids = clientes.map(c => c.id)

  let tarefas: Tarefa[] = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .eq('ano', ano)
      .eq('setor', 'pessoal')
      .in('cliente_id', ids)
      .limit(10000)
    tarefas = (data ?? []) as Tarefa[]
  }

  return (
    <HistoricoPessoal
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
    />
  )
}
