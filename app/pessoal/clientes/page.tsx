import { createClient } from '@/lib/supabase/server'
import ClientesListaPessoal from '@/components/pessoal/ClientesListaPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Pessoal' }

export default async function ClientesPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const catalogo = await buscarCatalogoCliente(supabase, 'pessoal')

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(c.tarefas_personalizadas, mesesVisiveisPorTipo, mes)
    progressoMap[c.id] = { total: visiveis.length, concluidas: 0 }
    tiposMap[c.id] = new Set(visiveis)
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
    'pessoal',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaPessoal
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
