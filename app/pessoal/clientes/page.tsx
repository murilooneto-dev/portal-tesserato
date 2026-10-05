import { createClient, createClienteLeituraVinculos } from '@/lib/supabase/server'
import ClientesListaPessoal from '@/components/pessoal/ClientesListaPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoAno } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { progressoMensalPessoal, type ProgressoMesPessoal } from '@/lib/pessoal-progresso'
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
    buscarTodasTarefasDoAno<Pick<Tarefa, 'cliente_id' | 'mes' | 'concluida' | 'tipo' | 'parcelamento_id'>>(supabase, ano, 'cliente_id, mes, concluida, tipo, parcelamento_id', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  // Tarefas de parcelamento têm um `tipo` sintético que não vem do catálogo
  // (ver lib/parcelamento-tarefas.ts) e não passam pelo filtro de meses
  // visíveis. A conta do % por mês (regra A) fica em lib/pessoal-progresso.ts,
  // a mesma usada na ficha do cliente.
  const parcelamentoIdsTodos = Array.from(new Set(
    (tarefas ?? []).filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsTodos)

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const tarefasPorCliente = new Map<string, typeof tarefas>()
  for (const t of tarefas) {
    const lista = tarefasPorCliente.get(t.cliente_id)
    if (lista) lista.push(t)
    else tarefasPorCliente.set(t.cliente_id, [t])
  }
  const progressoMap: Record<string, Record<number, ProgressoMesPessoal>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = progressoMensalPessoal({
      esperadasBase: calcularTarefasEsperadas(c, mapaVinculos),
      mesesVisiveisPorTipo,
      tarefas: tarefasPorCliente.get(c.id) ?? [],
      parcelamentosAtivos,
    })
  }

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    await createClienteLeituraVinculos(),
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas.filter(t => t.mes === mes),
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
