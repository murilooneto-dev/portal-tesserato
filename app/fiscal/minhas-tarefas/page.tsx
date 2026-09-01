import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { atualizarEtapa, toggleTarefaFiscal } from '@/app/fiscal/clientes/actions'
import { atualizarStatusDossie, atualizarFinalizadoDossie } from '@/lib/dossie-actions'
import MinhasTarefasFiltro from '@/components/fiscal/MinhasTarefasFiltro'
import MinhasTarefasTabs from '@/components/fiscal/MinhasTarefasTabs'
import DossieSecao from '@/components/fiscal/DossieSecao'
import type { StatusDossie } from '@/lib/status-dossie'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'

export const metadata = { title: 'Minhas Tarefas — Tesserato Fiscal' }

interface ClienteRow {
  id: string
  nome: string
  clientes_fiscal: {
    grupo: string | null
    regime: string | null
    atividade: string[] | null
    tarefas_personalizadas: string[] | null
    tarefas_excluidas: string[] | null
  }
}

export default async function MinhasTarefasPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome').eq('id', user.id).single()

  const { data: meusTiposRaw } = await supabase
    .from('tarefa_tipos')
    .select('nome, etapas, tipo_resposta')
    .eq('setor', 'fiscal')
    .eq('responsavel_id', user.id)
    .order('nome')

  const meusTipos = (meusTiposRaw ?? []) as { nome: string; etapas: string[] | null; tipo_resposta: TipoResposta }[]

  if (meusTipos.length === 0) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--fg)]">Minhas Tarefas</h1>
          <p className="text-[var(--fg)]/40 mt-1 text-sm">
            Tipos de tarefa atribuídos exclusivamente a você, em todos os clientes.
          </p>
        </div>
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">
          Nenhum tipo de tarefa está atribuído a você. Peça a um admin pra atribuir em Configurações.
        </p>
      </div>
    )
  }

  const [{ data: clientesRaw }, mapaVinculos, { data: dossieRaw }] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_fiscal!inner(grupo, regime, atividade, tarefas_personalizadas, tarefas_excluidas, ativo)')
      .eq('clientes_fiscal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'fiscal'),
    supabase
      .from('clientes')
      .select('id, nome, cnpj, clientes_fiscal!inner(dossie_status, dossie_finalizado, ativo, faz_dossie)')
      .eq('clientes_fiscal.ativo', true)
      .eq('clientes_fiscal.faz_dossie', true)
      .order('nome'),
  ])

  const clientesTodos = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    const esperadas = calcularTarefasEsperadas(
      {
        grupo: r.clientes_fiscal.grupo,
        regime: r.clientes_fiscal.regime,
        atividade: r.clientes_fiscal.atividade,
        tarefas_personalizadas: r.clientes_fiscal.tarefas_personalizadas ?? [],
        tarefas_excluidas: r.clientes_fiscal.tarefas_excluidas ?? [],
      },
      mapaVinculos,
    )
    return { id: r.id, nome: r.nome, esperadas }
  })

  const nomesMeusTipos = meusTipos.map(t => t.nome)
  const { data: tarefasRaw } = await supabase
    .from('tarefas')
    .select('id, cliente_id, tipo, concluida, concluida_em, sem_movimento')
    .eq('setor', 'fiscal').eq('mes', mes).eq('ano', ano)
    .in('tipo', nomesMeusTipos)

  const tarefas = (tarefasRaw ?? []) as Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
  const tarefaIds = tarefas.map(t => t.id)

  const { data: etapasRaw } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }
  const etapas = (etapasRaw ?? []) as TarefaEtapa[]

  interface DossieRow {
    id: string
    nome: string
    cnpj: string | null
    clientes_fiscal: { dossie_status: StatusDossie; dossie_finalizado: boolean }
  }
  const clientesDossie = (dossieRaw ?? []).map(row => {
    const r = row as unknown as DossieRow
    return {
      id: r.id,
      nome: r.nome,
      cnpj: r.cnpj,
      dossieStatus: r.clientes_fiscal.dossie_status,
      dossieFinalizado: r.clientes_fiscal.dossie_finalizado,
    }
  })

  async function onToggle(clienteId: string, tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaFiscal(clienteId, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    await atualizarEtapa(clienteId, mes, ano, tipo, etapaNome, concluida, data)
  }

  async function onAtualizarStatusDossie(clienteId: string, status: StatusDossie) {
    'use server'
    return await atualizarStatusDossie(clienteId, status)
  }

  async function onAtualizarFinalizadoDossie(clienteId: string, finalizado: boolean) {
    'use server'
    return await atualizarFinalizadoDossie(clienteId, finalizado)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Minhas Tarefas</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Tipos de tarefa atribuídos exclusivamente a você, em todos os clientes.
        </p>
      </div>

      <MinhasTarefasTabs
        tarefasContent={
          <MinhasTarefasFiltro
            secoes={meusTipos.map(tipoInfo => ({
              tipo: tipoInfo.nome,
              tipoResposta: tipoInfo.tipo_resposta,
              etapasDefinidas: tipoInfo.etapas,
              clientes: clientesTodos.filter(c => c.esperadas.includes(tipoInfo.nome)),
              tarefas: tarefas.filter(t => t.tipo === tipoInfo.nome),
            }))}
            etapas={etapas}
            mes={mes}
            ano={ano}
            usuarioNome={profile?.nome ?? user.email ?? ''}
            onToggle={onToggle}
            onAtualizarEtapa={onAtualizarEtapa}
          />
        }
        dossieContent={
          <DossieSecao
            clientes={clientesDossie}
            onAtualizarStatus={onAtualizarStatusDossie}
            onAtualizarFinalizado={onAtualizarFinalizadoDossie}
          />
        }
      />
    </div>
  )
}
