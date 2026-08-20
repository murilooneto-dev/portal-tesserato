import { createClient } from '@/lib/supabase/server'
import ClientesListaContabil from '@/components/contabil/ClientesListaContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Contábil' }

export default async function ClientesContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const catalogo = await buscarCatalogoCliente(supabase, 'contabil')

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = { total: c.tarefas_personalizadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(c.tarefas_personalizadas)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas,
    'contabil',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaContabil
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
