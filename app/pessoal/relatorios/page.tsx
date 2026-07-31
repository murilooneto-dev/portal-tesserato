import { createClient } from '@/lib/supabase/server'
import RelatoriosPessoal from '@/components/pessoal/RelatoriosPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Relatórios — Tesserato Pessoal' }

export default async function RelatoriosPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }

  const isAdmin = profile?.role === 'admin'

  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('clientes_pessoal.responsavel', profile.nome)

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  return (
    <RelatoriosPessoal
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
      mesesVisiveisPorTipo={mesesVisiveisPorTipo}
    />
  )
}
