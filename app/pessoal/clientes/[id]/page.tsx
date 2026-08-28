import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import { normalizarTitulo, prazoOperacional, diasRestantes } from '@/lib/calendario'
import TarefaChecklistPessoal from '@/components/pessoal/TarefaChecklistPessoal'
import ClientePessoalAcoes from '@/components/pessoal/ClientePessoalAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import ClienteObsSimples from '@/components/geral/ClienteObsSimples'
import { toggleTarefaPessoal, atualizarEtapa, salvarRespostaTexto, uploadArquivoTarefa, excluirArquivoTarefa, salvarObsPessoal } from '../actions'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta, CalendarioEvento } from '@/lib/types'
import { labelRegime } from '@/lib/atividades-regimes'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientePessoalDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClientePessoal(clienteRaw)

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()

  const { mes, ano } = await getMesAno()
  await sincronizarTarefasParcelamento(supabase, 'pessoal', mes, ano)
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const [{ data: tarefas }, { data: usuariosPessoal }, { data: tiposRaw }, labelsParcelamento] = await Promise.all([
    supabase.from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'pessoal'),
    supabase.from('profiles').select('nome').contains('setores', ['pessoal']),
    supabase.from('tarefa_tipos').select('nome, etapas, meses_visiveis, tipo_resposta').eq('setor', 'pessoal'),
    buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null),
  ])

  const parcelamentoIdsDaFicha = Array.from(new Set(
    (tarefas ?? []).filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsDaFicha)
  const tiposDeParcelamento = Array.from(new Set(
    (tarefas ?? []).filter(t => t.parcelamento_id && parcelamentosAtivos.has(t.parcelamento_id)).map(t => t.tipo)
  ))
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const tarefasPersonalizadasEfetivas = Array.from(new Set([...calcularTarefasEsperadas(cliente, mapaVinculos), ...tiposDeParcelamento]))

  const { data: eventosCalRaw } = await supabase
    .from('calendario_eventos')
    .select('*')
    .eq('setor', 'pessoal')

  const prazosPorTipo: Record<string, number> = {}
  for (const e of (eventosCalRaw ?? []) as CalendarioEvento[]) {
    const prazo = prazoOperacional(e, hoje)
    if (prazo) prazosPorTipo[normalizarTitulo(e.titulo)] = diasRestantes(prazo, hoje)
  }

  const eventosAvulsos = await buscarTarefasAvulsasDoMes(id, 'pessoal', mes, ano)

  const vinculos = await buscarVinculosDoCliente(
    supabase, id, cliente.tarefas_vinculadas_ativas ?? [], 'pessoal', mes, ano
  )

  const responsaveis = Array.from(new Set(
    (usuariosPessoal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()

  const tarefaTipos: Record<string, { etapas: string[] | null; mesesVisiveis: number[] | null; tipoResposta: TipoResposta }> = {}
  for (const t of tiposRaw ?? []) {
    tarefaTipos[t.nome as string] = {
      etapas: t.etapas as string[] | null,
      mesesVisiveis: t.meses_visiveis as number[] | null,
      tipoResposta: (t.tipo_resposta as TipoResposta) ?? 'data',
    }
  }
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)
  const catalogo = await buscarCatalogoCliente(supabase, 'pessoal')

  const tarefaIds = (tarefas ?? []).map(t => t.id)
  const { data: etapas } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }
  const { data: arquivos } = tarefaIds.length > 0
    ? await supabase.from('tarefa_arquivos').select('id, tarefa_id, name, size, uploaded_at').in('tarefa_id', tarefaIds)
    : { data: [] as Omit<TarefaArquivo, 'content_base64'>[] }

  async function onToggleSimples(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaPessoal(id, tipo, mes, ano, concluida, data)
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
          <Link href="/pessoal/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-[var(--fg)]">{cliente.nome}</h1>
                <p className="text-[var(--fg)]/40 text-sm mt-0.5">{cliente.cnpj ?? '—'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cliente.regime && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{labelRegime(cliente.regime)}</span>}
                  {(cliente.atividade ?? []).map(a => (
                    <span key={a} className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
                  {cliente.responsavel && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>}
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                  {cliente.ativo === false && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Desabilitado</span>}
                </div>
                {labelsParcelamento.length > 0 && (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/15 px-3 py-1 rounded-full">
                      ⚠️ Cliente possui parcelamento! {labelsParcelamento.join(' / ')}
                    </span>
                  </div>
                )}
              </div>
              {podeEditar && <ClientePessoalAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} catalogo={catalogo} />}
            </div>
          </div>
        </div>
      </div>

      <TarefaChecklistPessoal
        tarefasPersonalizadas={tarefasPersonalizadasEfetivas}
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

      <EventosAvulsosSecao clienteId={id} setor="pessoal" eventos={eventosAvulsos} podeEditar={podeEditar} />

      <ClienteObsSimples clienteId={id} obsInicial={cliente.obs ?? ''} podeEditar={podeEditar} salvarObs={salvarObsPessoal} />
    </div>
  )
}
