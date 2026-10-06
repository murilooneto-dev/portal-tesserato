import { createClient, createClienteLeituraVinculos } from '@/lib/supabase/server'
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

  const [{ data: clientesRaw }, tarefasDoAno, { data: tiposRaw }, { data: usuariosSetor }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoAno<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo' | 'mes'>>(supabase, ano, 'cliente_id, concluida, tipo, mes', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
    supabase.from('profiles').select('nome, cor').contains('setores', ['contabil']),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil', { mes, ano })
  // Esperadas de cada mês do ano: tarefa criada no meio do ano só entra na
  // conta a partir do mês em que foi criada.
  const progressoAnualMap: Record<string, { totalPorMes: Record<number, number>; concluidasPorMes: Record<number, number> }> = {}
  const tiposMap: Record<string, Record<number, Set<string>>> = {}
  for (const c of clientes) {
    progressoAnualMap[c.id] = { totalPorMes: {}, concluidasPorMes: {} }
    tiposMap[c.id] = {}
    for (let m = 1; m <= 12; m++) {
      const esperadas = calcularTarefasEsperadas(c, mapaVinculos, { mes: m, ano })
      progressoAnualMap[c.id].totalPorMes[m] = esperadas.length
      tiposMap[c.id][m] = new Set(esperadas)
    }
  }
  for (const t of tarefasDoAno) {
    if (t.concluida && tiposMap[t.cliente_id]?.[t.mes]?.has(t.tipo)) {
      const prog = progressoAnualMap[t.cliente_id]
      prog.concluidasPorMes[t.mes] = (prog.concluidasPorMes[t.mes] ?? 0) + 1
    }
  }

  const tarefasDoMes = tarefasDoAno.filter(t => t.mes === mes)
  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    await createClienteLeituraVinculos(),
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefasDoMes,
    'contabil',
    mes,
    ano,
  )

  // Cor do perfil de cada responsável, para a bolinha com a inicial.
  const coresResponsavel: Record<string, string> = {}
  for (const u of usuariosSetor ?? []) {
    if (u.nome && u.cor) coresResponsavel[(u.nome as string).toUpperCase()] = u.cor as string
  }

  return (
    <ClientesListaContabil
      clientes={clientes}
      progressoAnualMap={progressoAnualMap}
      mes={mes}
      ano={ano}
      tarefasPadrao={tarefasPadrao}
      catalogo={catalogo}
      pendenciasVinculo={pendenciasVinculo}
      coresResponsavel={coresResponsavel}
    />
  )
}
