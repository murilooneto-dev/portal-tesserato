import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { normalizarTitulo, prazoOperacional, diasRestantes } from '@/lib/calendario'
import TarefaChecklistContabil from '@/components/contabil/TarefaChecklistContabil'
import ClienteContabilAcoes from '@/components/contabil/ClienteContabilAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import ClienteObsSimples from '@/components/geral/ClienteObsSimples'
import { toggleTarefaContabil, atualizarEtapa, salvarRespostaTexto, uploadArquivoTarefa, excluirArquivoTarefa, salvarObsContabil } from '../actions'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta, CalendarioEvento } from '@/lib/types'
import { labelRegime } from '@/lib/atividades-regimes'

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
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const [{ data: tarefas }, { data: usuariosContabil }, { data: tiposRaw }, { data: eventosCalRaw }] = await Promise.all([
    supabase.from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'contabil'),
    supabase.from('profiles').select('nome').contains('setores', ['contabil']),
    supabase.from('tarefa_tipos').select('nome, etapas, tipo_resposta').eq('setor', 'contabil'),
    supabase.from('calendario_eventos').select('*').eq('setor', 'contabil'),
  ])

  const prazosPorTipo: Record<string, number> = {}
  for (const e of (eventosCalRaw ?? []) as CalendarioEvento[]) {
    const prazo = prazoOperacional(e, hoje)
    if (prazo) prazosPorTipo[normalizarTitulo(e.titulo)] = diasRestantes(prazo, hoje)
  }

  const eventosAvulsos = await buscarTarefasAvulsasDoMes(id, 'contabil', mes, ano)

  const vinculos = await buscarVinculosDoCliente(
    supabase, id, cliente.tarefas_vinculadas_ativas ?? [], 'contabil', mes, ano
  )

  const responsaveis = Array.from(new Set(
    (usuariosContabil ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()

  const tarefaTipos: Record<string, { etapas: string[] | null; tipoResposta: TipoResposta }> = {}
  for (const t of tiposRaw ?? []) {
    tarefaTipos[t.nome as string] = {
      etapas: t.etapas as string[] | null,
      tipoResposta: (t.tipo_resposta as TipoResposta) ?? 'data',
    }
  }
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const tarefaIds = (tarefas ?? []).map(t => t.id)
  const { data: etapas } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }
  const { data: arquivos } = tarefaIds.length > 0
    ? await supabase.from('tarefa_arquivos').select('id, tarefa_id, name, size, uploaded_at').in('tarefa_id', tarefaIds)
    : { data: [] as Omit<TarefaArquivo, 'content_base64'>[] }

  async function onToggleSimples(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaContabil(id, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    await atualizarEtapa(id, mes, ano, tipo, etapaNome, concluida, data)
  }

  async function onSalvarTexto(tipo: string, texto: string) {
    'use server'
    await salvarRespostaTexto(id, tipo, mes, ano, texto)
  }

  async function onUploadArquivo(tipo: string, formData: FormData) {
    'use server'
    return await uploadArquivoTarefa(id, tipo, mes, ano, formData)
  }

  async function onExcluirArquivo(arquivoId: string) {
    'use server'
    await excluirArquivoTarefa(arquivoId)
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
                  {cliente.regime && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{labelRegime(cliente.regime)}</span>}
                  {cliente.atividade && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>}
                  {cliente.responsavel && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>}
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                  {!cliente.ativo && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Desabilitado</span>}
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
        arquivos={(arquivos ?? []) as Omit<TarefaArquivo, 'content_base64'>[]}
        vinculos={vinculos}
        mes={mes}
        ano={ano}
        onToggleSimples={onToggleSimples}
        onAtualizarEtapa={onAtualizarEtapa}
        onSalvarTexto={onSalvarTexto}
        onUploadArquivo={onUploadArquivo}
        onExcluirArquivo={onExcluirArquivo}
        podeEditar={podeEditar}
        prazosPorTipo={prazosPorTipo}
      />

      <EventosAvulsosSecao clienteId={id} setor="contabil" eventos={eventosAvulsos} podeEditar={podeEditar} />

      <ClienteObsSimples clienteId={id} obsInicial={cliente.obs ?? ''} podeEditar={podeEditar} salvarObs={salvarObsContabil} />
    </div>
  )
}
