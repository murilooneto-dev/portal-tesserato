import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { mes, ano } = await getMesAno()

  const clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')

  const [{ data: clientesRaw }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
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

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas ?? [],
    'fiscal',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        templates={templatesMap}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
