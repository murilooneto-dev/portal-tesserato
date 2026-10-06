import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, nomesTarefaTipoNaoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { toggleTarefaPessoal } from '@/app/pessoal/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento rápido — Tesserato Pessoal' }

interface ClienteRow {
  id: string
  nome: string
  cnpj: string | null
  clientes_pessoal: {
    regime: string | null
    atividade: string[]
    responsavel: string | null
    tarefas_personalizadas: string[]
    tarefas_excluidas: string[]
  }
}

export default async function PreenchimentoRapidoPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, nome').eq('id', user.id).single()

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, cnpj, clientes_pessoal!inner(regime, atividade, responsavel, ativo, tarefas_personalizadas, tarefas_excluidas)')
      .eq('clientes_pessoal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'pessoal', { mes, ano }),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas').eq('setor', 'pessoal'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'pessoal',
    ),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      cnpj: r.cnpj,
      regime: r.clientes_pessoal.regime,
      atividade: r.clientes_pessoal.atividade,
      responsavel: r.clientes_pessoal.responsavel,
      tarefas_personalizadas: r.clientes_pessoal.tarefas_personalizadas,
      tarefas_excluidas: r.clientes_pessoal.tarefas_excluidas,
    }
  })

  const clientes = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

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
    await toggleTarefaPessoal(clienteId, tipo, mes, ano, concluida)
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Preenchimento rápido"
        subtitulo="Marque a mesma tarefa em vários clientes de uma vez. Cada marcação é salva na hora."
      />
      <PreenchimentoRapido
        camposDisponiveis={[]}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        tiposNaoData={tiposNaoData}
        filtroPendentes
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </Pagina>
  )
}
