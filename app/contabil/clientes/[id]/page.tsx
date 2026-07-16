import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import TarefaChecklistContabil from '@/components/contabil/TarefaChecklistContabil'
import ClienteContabilAcoes from '@/components/contabil/ClienteContabilAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import { toggleTarefaContabil, atualizarEtapa } from '../actions'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import type { Tarefa, TarefaEtapa } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteContabilDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClienteContabil(clienteRaw)

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()

  const { mes, ano } = await getMesAno()

  const [{ data: tarefas }, { data: todosContabil }, { data: tiposRaw }] = await Promise.all([
    supabase.from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'contabil'),
    supabase.from('clientes_contabil').select('responsavel'),
    supabase.from('tarefa_tipos').select('nome, etapas').eq('setor', 'contabil'),
  ])

  const eventosAvulsos = await buscarTarefasAvulsasDoMes(id, 'contabil', mes, ano)

  const vinculos = await buscarVinculosDoCliente(
    supabase, id, cliente.tarefas_vinculadas_ativas ?? [], 'contabil', mes, ano
  )

  const responsaveis = Array.from(new Set(
    (todosContabil ?? []).map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()

  const tarefaTipos: Record<string, string[] | null> = {}
  for (const t of tiposRaw ?? []) {
    tarefaTipos[t.nome as string] = t.etapas as string[] | null
  }
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const tarefaIds = (tarefas ?? []).map(t => t.id)
  const { data: etapas } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }

  async function onToggleSimples(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaContabil(id, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    await atualizarEtapa(id, mes, ano, tipo, etapaNome, concluida, data)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 pb-6 border-b border-[var(--fg)]/8">
        <div className="flex items-start gap-4">
          <Link href="/contabil/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-[var(--fg)]">{cliente.nome}</h1>
                <p className="text-[var(--fg)]/40 text-sm mt-0.5">{cliente.cnpj ?? '—'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cliente.atividade && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>}
                  {cliente.responsavel && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>}
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                </div>
              </div>
              {podeEditar && <ClienteContabilAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} />}
            </div>
          </div>
        </div>
      </div>

      <TarefaChecklistContabil
        tarefasPersonalizadas={cliente.tarefas_personalizadas}
        tarefaTipos={tarefaTipos}
        tarefas={(tarefas ?? []) as Tarefa[]}
        etapas={(etapas ?? []) as TarefaEtapa[]}
        vinculos={vinculos}
        mes={mes}
        ano={ano}
        onToggleSimples={onToggleSimples}
        onAtualizarEtapa={onAtualizarEtapa}
        podeEditar={podeEditar}
      />

      <EventosAvulsosSecao clienteId={id} setor="contabil" eventos={eventosAvulsos} podeEditar={podeEditar} />
    </div>
  )
}
