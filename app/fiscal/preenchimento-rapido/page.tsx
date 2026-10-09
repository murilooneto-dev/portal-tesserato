import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, nomesTarefaTipoNaoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
import { tiposOcultosNoCliente } from '@/lib/tarefa-tipo-visibilidade'
import { toggleTarefaFiscal } from '@/app/fiscal/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento rápido — Tesserato Fiscal' }

interface ClienteRow {
  id: string
  nome: string
  cnpj: string | null
  clientes_fiscal: {
    regime: string | null
    atividade: string[]
    responsavel: string | null
    tarefas_personalizadas: string[]
    tarefas_excluidas: string[]
  }
}

export default async function PreenchimentoRapidoFiscalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, nome').eq('id', user.id).single()

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas, regimesPorTipo] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, cnpj, clientes_fiscal!inner(regime, atividade, responsavel, ativo, tarefas_personalizadas, tarefas_excluidas)')
      .eq('clientes_fiscal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'fiscal', { mes, ano }),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas, responsavel_id').eq('setor', 'fiscal'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'fiscal',
    ),
    buscarRegimesPorTipo(supabase, 'fiscal'),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      cnpj: r.cnpj,
      regime: r.clientes_fiscal.regime,
      atividade: r.clientes_fiscal.atividade,
      responsavel: r.clientes_fiscal.responsavel,
      tarefas_personalizadas: r.clientes_fiscal.tarefas_personalizadas,
      tarefas_excluidas: r.clientes_fiscal.tarefas_excluidas,
    }
  })

  const clientesDoUsuario = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

  // Tipo com dono só aparece aqui para o dono (ou admin) nos clientes de regime
  // que ele atende; o servidor recusa a marcação dos demais (podeEditarTarefaTipo).
  // Sai da grade tirando o tipo das tarefas do cliente, sem mexer na regra de
  // aplicabilidade (calcularTarefasEsperadas).
  const donoIdPorTipo: Record<string, string> = {}
  for (const t of tiposRaw ?? []) {
    if (t.responsavel_id) donoIdPorTipo[t.nome as string] = t.responsavel_id as string
  }
  const clientes = clientesDoUsuario.map(c => {
    const ocultos = tiposOcultosNoCliente(donoIdPorTipo, regimesPorTipo, c.regime, user.id, profile?.role)
    if (ocultos.length === 0) return c
    return {
      ...c,
      tarefas_personalizadas: (c.tarefas_personalizadas ?? []).filter(t => !ocultos.includes(t)),
      tarefas_excluidas: [...(c.tarefas_excluidas ?? []), ...ocultos],
    }
  })

  const tiposData = nomesTarefaTipoData(tiposRaw ?? [])
  const tiposNaoData = nomesTarefaTipoNaoData(tiposRaw ?? [])

  const idsPermitidos = new Set(clientes.map(c => c.id))
  const estadoInicial: Record<string, Record<string, boolean>> = {}
  for (const t of tarefas) {
    if (!idsPermitidos.has(t.cliente_id)) continue
    if (!estadoInicial[t.cliente_id]) estadoInicial[t.cliente_id] = {}
    estadoInicial[t.cliente_id][t.tipo] = t.concluida
  }

  async function onToggle(clienteId: string, tipo: string, concluida: boolean) {
    'use server'
    await toggleTarefaFiscal(clienteId, tipo, mes, ano, concluida)
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Preenchimento rápido"
        subtitulo="Marque a mesma tarefa em vários clientes de uma vez. Cada marcação é salva na hora."
      />
      <PreenchimentoRapido
        camposDisponiveis={['regime', 'atividade']}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        tiposNaoData={tiposNaoData}
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </Pagina>
  )
}
