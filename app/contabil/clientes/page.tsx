import { createClient } from '@/lib/supabase/server'
import ClientesListaContabil from '@/components/contabil/ClientesListaContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoAno } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa } from '@/lib/types'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'

export const metadata = { title: 'Clientes — Tesserato Contábil' }

export default async function ClientesContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const catalogo = await buscarCatalogoCliente(supabase, 'contabil')

  const [{ data: clientesRaw }, tarefasDoAno, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoAno<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo' | 'mes'>>(supabase, ano, 'cliente_id, concluida, tipo, mes', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
  const progressoAnualMap: Record<string, { total: number; concluidasPorMes: Record<number, number> }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const esperadas = calcularTarefasEsperadas(c, mapaVinculos)
    progressoAnualMap[c.id] = { total: esperadas.length, concluidasPorMes: {} }
    tiposMap[c.id] = new Set(esperadas)
  }
  for (const t of tarefasDoAno) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      const prog = progressoAnualMap[t.cliente_id]
      prog.concluidasPorMes[t.mes] = (prog.concluidasPorMes[t.mes] ?? 0) + 1
    }
  }

  const tarefasDoMes = tarefasDoAno.filter(t => t.mes === mes)
  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefasDoMes,
    'contabil',
    mes,
    ano,
  )

  return (
    <div className="p-8">
      <ClientesListaContabil
        clientes={clientes}
        progressoAnualMap={progressoAnualMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
