import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { toggleTarefaFiscal } from '@/app/fiscal/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento Rápido — Tesserato Fiscal' }

interface ClienteRow {
  id: string
  nome: string
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

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_fiscal!inner(regime, atividade, responsavel, ativo, tarefas_personalizadas, tarefas_excluidas)')
      .eq('clientes_fiscal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'fiscal'),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas').eq('setor', 'fiscal'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'fiscal',
    ),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      regime: r.clientes_fiscal.regime,
      atividade: r.clientes_fiscal.atividade,
      responsavel: r.clientes_fiscal.responsavel,
      tarefas_personalizadas: r.clientes_fiscal.tarefas_personalizadas,
      tarefas_excluidas: r.clientes_fiscal.tarefas_excluidas,
    }
  })

  const clientes = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

  const tiposData = nomesTarefaTipoData(tiposRaw ?? [])

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
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Preenchimento Rápido</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Marque a mesma tarefa pra vários clientes de uma vez.
        </p>
      </div>
      <PreenchimentoRapido
        camposDisponiveis={['regime', 'atividade']}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </div>
  )
}
