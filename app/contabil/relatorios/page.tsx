import { createClient } from '@/lib/supabase/server'
import RelatoriosContabil from '@/components/contabil/RelatoriosContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import { listarGruposDoSetor } from '@/lib/tarefa-grupos-actions'

export const metadata = { title: 'Relatórios — Tesserato Contábil' }

export default async function RelatoriosContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }

  const isAdmin = profile?.role === 'admin'

  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('clientes_contabil.ativo', true).order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('clientes_contabil.responsavel', profile.nome)

  const [{ data: clientesRaw }, tarefas, { data: observacoes }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'contabil'),
    supabase.from('observacoes_clientes').select('cliente_id,texto').eq('mes', mes).eq('ano', ano),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
  const catalogo = await buscarCatalogoCliente(supabase, 'contabil')
  const { data: gruposCatalogo } = await listarGruposDoSetor('contabil')

  const obsPorCliente: Record<string, string> = {}
  for (const row of observacoes ?? []) {
    if (row.texto?.trim()) obsPorCliente[row.cliente_id] = row.texto
  }

  return (
    <RelatoriosContabil
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
      obsPorCliente={obsPorCliente}
      mapaVinculos={mapaVinculos}
      atividadesCatalogo={catalogo.atividades}
      gruposCatalogo={gruposCatalogo}
    />
  )
}
