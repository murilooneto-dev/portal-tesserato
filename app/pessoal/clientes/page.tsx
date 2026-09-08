import { createClient } from '@/lib/supabase/server'
import ClientesListaPessoal from '@/components/pessoal/ClientesListaPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa } from '@/lib/types'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'

export const metadata = { title: 'Clientes — Tesserato Pessoal' }

export default async function ClientesPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  // Garante que parcelamentos "EM ANDAMENTO" já tenham sua tarefa sintética
  // em `tarefas` pra este mes/ano, mesmo que ninguém tenha aberto a ficha
  // individual do cliente ainda (mesma chamada feita em
  // app/pessoal/clientes/[id]/page.tsx).
  await sincronizarTarefasParcelamento(supabase, 'pessoal', mes, ano)

  const catalogo = await buscarCatalogoCliente(supabase, 'pessoal')

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo' | 'parcelamento_id'>>(supabase, mes, ano, 'cliente_id, concluida, tipo, parcelamento_id', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  // Tarefas de parcelamento têm um `tipo` sintético que não vem do catálogo
  // (ver lib/parcelamento-tarefas.ts) e não passam pelo filtro de meses
  // visíveis — mesmo tratamento dado em app/pessoal/clientes/[id]/page.tsx,
  // só que resolvido uma vez pra todos os clientes em vez de um por um.
  const parcelamentoIdsTodos = Array.from(new Set(
    (tarefas ?? []).filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsTodos)
  const tiposParcelamentoPorCliente: Record<string, Set<string>> = {}
  for (const t of tarefas ?? []) {
    if (t.parcelamento_id && parcelamentosAtivos.has(t.parcelamento_id)) {
      (tiposParcelamentoPorCliente[t.cliente_id] ??= new Set()).add(t.tipo)
    }
  }

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(calcularTarefasEsperadas(c, mapaVinculos), mesesVisiveisPorTipo, mes)
    const tiposFinal = Array.from(new Set([...visiveis, ...(tiposParcelamentoPorCliente[c.id] ?? [])]))
    progressoMap[c.id] = { total: tiposFinal.length, concluidas: 0 }
    tiposMap[c.id] = new Set(tiposFinal)
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
