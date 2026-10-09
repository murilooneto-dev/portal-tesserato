import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { atualizarEtapa, toggleTarefaFiscal } from '@/app/fiscal/clientes/actions'
import { atualizarStatusDossie, atualizarFinalizadoDossie } from '@/lib/dossie-actions'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import { buscarTarefasAvulsasDoMesParaClientes } from '@/lib/tarefas-avulsas'
import MinhasTarefasFiltro from '@/components/fiscal/MinhasTarefasFiltro'
import MinhasTarefasTabs from '@/components/fiscal/MinhasTarefasTabs'
import MinhasTarefasSeletorUsuario from '@/components/fiscal/MinhasTarefasSeletorUsuario'
import { clientesDaSecao } from '@/lib/minhas-tarefas-regimes'
import DossieSecao from '@/components/fiscal/DossieSecao'
import EventosConsolidados from '@/components/fiscal/EventosConsolidados'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { ClipboardList, Users } from 'lucide-react'
import type { StatusDossie } from '@/lib/status-dossie'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'

export const metadata = { title: 'Minhas tarefas — Tesserato Fiscal' }

interface ClienteRow {
  id: string
  nome: string
  clientes_fiscal: {
    regime: string | null
    atividade: string[] | null
    tarefas_personalizadas: string[] | null
    tarefas_excluidas: string[] | null
  }
}

interface Props {
  searchParams: Promise<{ usuario?: string }>
}

export default async function MinhasTarefasPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const { usuario: usuarioParam } = await searchParams

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome, role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  let usuariosElegiveis: { id: string; nome: string }[] = []
  let targetUserId = user.id
  let nomeAlvo = profile?.nome ?? user.email ?? 'Usuário'
  let somenteLeitura = false

  if (isAdmin) {
    const { data: responsaveisRaw } = await supabase
      .from('tarefa_tipos')
      .select('responsavel_id')
      .eq('setor', 'fiscal')
      .not('responsavel_id', 'is', null)

    const idsElegiveis = Array.from(new Set((responsaveisRaw ?? []).map(r => r.responsavel_id as string)))

    if (idsElegiveis.length > 0) {
      const { data: usuariosRaw } = await supabase
        .from('profiles')
        .select('id, nome')
        .in('id', idsElegiveis)
        .order('nome')
      usuariosElegiveis = usuariosRaw ?? []
    }

    const alvo = usuarioParam ? usuariosElegiveis.find(u => u.id === usuarioParam) : undefined

    if (!alvo) {
      return (
        <Pagina>
          <CabecalhoPagina
            titulo="Minhas tarefas"
            subtitulo="Selecione um usuário para ver o resumo de tarefas dele."
          />
          <MinhasTarefasSeletorUsuario usuarios={usuariosElegiveis} selecionado={usuarioParam} />
          <Card semPadding>
            <EmptyState
              icone={<Users size={24} />}
              titulo={usuariosElegiveis.length === 0 ? 'Nenhum usuário com tarefas' : 'Selecione um usuário'}
              descricao={usuariosElegiveis.length === 0
                ? 'Nenhum usuário tem tipos de tarefa atribuídos no Fiscal ainda.'
                : 'Selecione um usuário acima para ver as tarefas dele.'}
            />
          </Card>
        </Pagina>
      )
    }

    targetUserId = alvo.id
    nomeAlvo = alvo.nome
    somenteLeitura = targetUserId !== user.id
  }

  const { data: meusTiposRaw } = await supabase
    .from('tarefa_tipos')
    .select('nome, etapas, tipo_resposta')
    .eq('setor', 'fiscal')
    .eq('responsavel_id', targetUserId)
    .order('nome')

  const meusTipos = (meusTiposRaw ?? []) as { nome: string; etapas: string[] | null; tipo_resposta: TipoResposta }[]

  if (meusTipos.length === 0) {
    return (
      <Pagina>
        <CabecalhoPagina
          titulo="Minhas tarefas"
          subtitulo={somenteLeitura ? `Tipos de tarefa atribuídos a ${nomeAlvo}, em todos os clientes` : 'Tipos de tarefa atribuídos a você, em todos os clientes'}
        />
        {isAdmin && <MinhasTarefasSeletorUsuario usuarios={usuariosElegiveis} selecionado={usuarioParam} />}
        <Card semPadding>
          <EmptyState
            icone={<ClipboardList size={24} />}
            titulo="Nenhuma tarefa atribuída"
            descricao={isAdmin
              ? `Nenhum tipo de tarefa está atribuído a ${nomeAlvo}.`
              : 'Nenhum tipo de tarefa está atribuído a você. Peça a um admin pra atribuir em Configurações.'}
          />
        </Card>
      </Pagina>
    )
  }

  const [{ data: clientesRaw }, mapaVinculos, { data: dossieRaw }, catalogo, { data: marcacaoRaw }] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_fiscal!inner(regime, atividade, tarefas_personalizadas, tarefas_excluidas, ativo)')
      .eq('clientes_fiscal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'fiscal', { mes, ano }),
    supabase
      .from('clientes')
      .select('id, nome, cnpj, clientes_fiscal!inner(dossie_status, dossie_finalizado, ativo, faz_dossie)')
      .eq('clientes_fiscal.ativo', true)
      .eq('clientes_fiscal.faz_dossie', true)
      .order('nome'),
    buscarCatalogoCliente(supabase, 'fiscal'),
    supabase.from('minhas_tarefas_regimes').select('regimes')
      .eq('user_id', targetUserId).eq('setor', 'fiscal').maybeSingle(),
  ])

  const regimesAlvo = ((marcacaoRaw?.regimes ?? []) as string[])

  const clientesTodos = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    const esperadas = calcularTarefasEsperadas(
      {
        regime: r.clientes_fiscal.regime,
        atividade: r.clientes_fiscal.atividade,
        tarefas_personalizadas: r.clientes_fiscal.tarefas_personalizadas ?? [],
        tarefas_excluidas: r.clientes_fiscal.tarefas_excluidas ?? [],
      },
      mapaVinculos,
    )
    return { id: r.id, nome: r.nome, atividade: r.clientes_fiscal.atividade ?? [], regime: r.clientes_fiscal.regime, esperadas }
  })

  const nomesMeusTipos = meusTipos.map(t => t.nome)
  const { data: tarefasRaw } = await supabase
    .from('tarefas')
    .select('id, cliente_id, tipo, concluida, concluida_em, sem_movimento')
    .eq('setor', 'fiscal').eq('mes', mes).eq('ano', ano)
    .in('tipo', nomesMeusTipos)

  const tarefas = (tarefasRaw ?? []) as Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
  const tarefaIds = tarefas.map(t => t.id)

  const eventosConsolidados = await buscarTarefasAvulsasDoMesParaClientes(
    clientesTodos.map(c => c.id), 'fiscal', mes, ano,
  )

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
    <Pagina>
      <CabecalhoPagina
        titulo="Minhas tarefas"
        subtitulo={somenteLeitura ? `Tipos de tarefa atribuídos a ${nomeAlvo}, em todos os clientes` : 'Tipos de tarefa atribuídos a você, em todos os clientes'}
      />

      {isAdmin && <MinhasTarefasSeletorUsuario usuarios={usuariosElegiveis} selecionado={usuarioParam} />}

      {isAdmin && somenteLeitura && (
        <Aviso tom="info">
          Você está vendo as tarefas de <b>{nomeAlvo}</b> em <b>somente leitura</b>.
        </Aviso>
      )}

      <MinhasTarefasTabs
        contagens={{ eventos: eventosConsolidados.length, dossie: clientesDossie.length }}
        tarefasContent={
          <MinhasTarefasFiltro
            secoes={meusTipos.map(tipoInfo => ({
              tipo: tipoInfo.nome,
              tipoResposta: tipoInfo.tipo_resposta,
              etapasDefinidas: tipoInfo.etapas,
              clientes: clientesDaSecao(clientesTodos, tipoInfo.nome, regimesAlvo),
              tarefas: tarefas.filter(t => t.tipo === tipoInfo.nome),
            }))}
            atividadesCatalogo={catalogo.atividades}
            etapas={etapas}
            mes={mes}
            ano={ano}
            nomeUsuario={nomeAlvo}
            somenteLeitura={somenteLeitura}
            onToggle={onToggle}
            onAtualizarEtapa={onAtualizarEtapa}
          />
        }
        eventosContent={
          <EventosConsolidados
            clientes={clientesTodos}
            eventos={eventosConsolidados}
            podeEditar={!somenteLeitura}
            mes={mes}
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
    </Pagina>
  )
}
