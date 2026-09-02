import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import type { TarefaArquivo, TarefaEtapa, TipoResposta, TarefaGrupo } from '@/lib/types'
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
import { normalizarTitulo, prazoOperacional, diasRestantes } from '@/lib/calendario'
import type { CalendarioEvento } from '@/lib/types'
import TarefaChecklist from '@/components/fiscal/TarefaChecklist'
import { atualizarEtapa, salvarRespostaTexto, uploadArquivoTarefa, excluirArquivoTarefa, toggleTarefaFiscal } from '../actions'
import ClienteObs from '@/components/fiscal/ClienteObs'
import ClienteArquivos from '@/components/fiscal/ClienteArquivos'
import ClienteConferencia from '@/components/fiscal/ClienteConferencia'
import ClienteAcoes from '@/components/fiscal/ClienteAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import { bucketDoRegime } from '@/lib/regime-bucket'

interface Props {
  params: Promise<{ id: string }>
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']


export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClienteFiscal(clienteRaw)

  const labelsParcelamento = await buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null)

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()

  const { mes, ano } = await getMesAno()
  await sincronizarTarefasParcelamento(supabase, 'fiscal', mes, ano)
  const anoAtual = getMesAnoRealAgora().ano
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  // Tarefas do mês selecionado
  const { data: tarefas } = await supabase
    .from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'fiscal')

  const { data: gruposRaw } = await supabase
    .from('tarefa_grupos').select('id, cliente_id, setor, nome, tarefas').eq('cliente_id', id).eq('setor', 'fiscal')

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')
  const tarefasBaseFiscal = calcularTarefasEsperadas(cliente, mapaVinculos)
  const parcelamentoIdsDaFicha = Array.from(new Set(
    (tarefas ?? []).filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsDaFicha)
  const tiposDeParcelamento = Array.from(new Set(
    (tarefas ?? []).filter(t => t.parcelamento_id && parcelamentosAtivos.has(t.parcelamento_id)).map(t => t.tipo)
  ))
  const tarefasPersonalizadasEfetivas = Array.from(new Set([...tarefasBaseFiscal, ...tiposDeParcelamento]))

  const { data: tiposRaw } = await supabase
    .from('tarefa_tipos').select('nome, etapas, tipo_resposta, responsavel_id').eq('setor', 'fiscal')

  const tarefaTipos: Record<string, { etapas: string[] | null; tipoResposta: TipoResposta }> = {}
  const responsavelIdPorTipo: Record<string, string | null> = {}
  for (const t of tiposRaw ?? []) {
    tarefaTipos[t.nome as string] = {
      etapas: t.etapas as string[] | null,
      tipoResposta: (t.tipo_resposta as TipoResposta) ?? 'data',
    }
    responsavelIdPorTipo[t.nome as string] = t.responsavel_id as string | null
  }

  // Um tipo com responsável exclusivo some da ficha (e da % de progresso)
  // pra quem não é o dono nem admin — ver lib/supabase/server.ts:podeEditarTarefaTipo,
  // que faz a mesma checagem no servidor pra cada escrita.
  const ehDonoOuAdmin = (tipo: string) =>
    tipoVisivelParaUsuario(responsavelIdPorTipo[tipo], user.id, profile?.role)

  const tarefasPersonalizadasVisiveis = tarefasPersonalizadasEfetivas.filter(ehDonoOuAdmin)

  const podeEditarPorTipo: Record<string, boolean> = {}
  for (const tipo of tarefasPersonalizadasVisiveis) {
    podeEditarPorTipo[tipo] = responsavelIdPorTipo[tipo]
      ? (profile?.role === 'admin' || responsavelIdPorTipo[tipo] === user.id)
      : podeEditar
  }

  const tarefaIds = (tarefas ?? []).map(t => t.id)
  const { data: etapasCatalogo } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }
  const { data: arquivosCatalogo } = tarefaIds.length > 0
    ? await supabase.from('tarefa_arquivos').select('id, tarefa_id, name, size, uploaded_at').in('tarefa_id', tarefaIds)
    : { data: [] as Omit<TarefaArquivo, 'content_base64'>[] }

  const eventosAvulsos = await buscarTarefasAvulsasDoMes(id, 'fiscal', mes, ano)

  const vinculos = await buscarVinculosDoCliente(
    supabase, id, cliente.tarefas_vinculadas_ativas ?? [], 'fiscal', mes, ano
  )

  // Todas as tarefas do ano para o histórico
  const { data: tarefasAno } = await supabase
    .from('tarefas').select('mes,concluida,tipo').eq('cliente_id', id).eq('ano', ano).eq('setor', 'fiscal')

  // Arquivos do cliente (inclui content_base64 para conferência)
  const { data: arquivos } = await supabase
    .from('client_files').select('id,name,size,uploaded_at,content_base64').eq('cliente_id', id).order('uploaded_at', { ascending: false })

  // Observação do mês selecionado
  const { data: observacao } = await supabase
    .from('observacoes_clientes')
    .select('texto')
    .eq('cliente_id', id)
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle()

  // Eventos do calendário do setor, pra casar com tarefas de mesmo nome
  // e mostrar o prazo operacional na linha da tarefa.
  const { data: eventosCalRaw } = await supabase
    .from('calendario_eventos')
    .select('*')
    .eq('setor', 'fiscal')

  const prazosPorTipo: Record<string, number> = {}
  for (const e of (eventosCalRaw ?? []) as CalendarioEvento[]) {
    const prazo = prazoOperacional(e, hoje)
    if (prazo) prazosPorTipo[normalizarTitulo(e.titulo)] = diasRestantes(prazo, hoje)
  }

  // Dados pro EmpresaModal (editar cliente)
  const { data: usuariosFiscal } = await supabase.from('profiles').select('nome').contains('setores', ['fiscal'])
  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
  const catalogo = await buscarCatalogoCliente(supabase, 'fiscal')

  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaFiscal(id, tipo, mes, ano, concluida, data)
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

  // Histórico por mês — só conta os tipos visíveis pro usuário atual, senão
  // uma tarefa de responsável exclusivo alheio continuaria influenciando a %
  // de quem não deveria nem ver essa tarefa.
  const historicoMeses = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const total = tarefasPersonalizadasVisiveis.length
    const feitas = (tarefasAno ?? []).filter(
      t => t.mes === m && t.concluida && tarefasPersonalizadasVisiveis.includes(t.tipo as string)
    ).length
    const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
    return { m, total, feitas, pct }
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-[var(--fg)]/8">
        <div className="flex items-start gap-4">
          <Link href="/fiscal/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-[var(--fg)]">{cliente.nome}</h1>
                <p className="text-[var(--fg)]/40 text-sm mt-0.5">{cliente.cnpj ?? '—'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cliente.regime && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.regime}</span>}
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
              <div className="flex items-center gap-3">
                <span className="text-[var(--fg)] font-medium text-sm">
                  {MESES_ABREV[mes-1]} / {ano}
                </span>
                {podeEditar && <ClienteAcoes cliente={cliente} responsaveis={responsaveis} catalogo={catalogo} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <TarefaChecklist
        clienteId={id}
        clienteNome={cliente.nome}
        grupo={bucketDoRegime(cliente.regime)}
        tarefasPersonalizadas={tarefasPersonalizadasVisiveis}
        tarefas={tarefas ?? []}
        grupos={(gruposRaw ?? []) as TarefaGrupo[]}
        vinculos={vinculos}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        usuarioNome={profile?.nome ?? user.email ?? ''}
        mitInicial={cliente.mit ?? ''}
        onToggle={toggleTarefa}
        podeEditar={podeEditar}
        podeEditarPorTipo={podeEditarPorTipo}
        tarefaTipos={tarefaTipos}
        etapas={(etapasCatalogo ?? []) as TarefaEtapa[]}
        arquivos={(arquivosCatalogo ?? []) as Omit<TarefaArquivo, 'content_base64'>[]}
        onAtualizarEtapa={onAtualizarEtapa}
        onSalvarTexto={onSalvarTexto}
        onUploadArquivo={onUploadArquivo}
        onExcluirArquivo={onExcluirArquivo}
        prazosPorTipo={prazosPorTipo}
      />

      <EventosAvulsosSecao clienteId={id} setor="fiscal" eventos={eventosAvulsos} podeEditar={podeEditar} />

      <ClienteObs clienteId={id} obsInicial={observacao?.texto ?? ''} mes={mes} ano={ano} podeEditar={podeEditar} />

      <ClienteArquivos clienteId={id} arquivosIniciais={arquivos ?? []} podeEditar={podeEditar} />

      <ClienteConferencia
        clienteNome={cliente.nome}
        arquivosDTE={(arquivos ?? []).filter(a => /\.xlsx?$/i.test(a.name)).map(a => ({ id: a.id, name: a.name, content_base64: a.content_base64 ?? '' }))}
      />

      {/* Histórico anual */}
      <div className="mt-10 pt-6 border-t border-[var(--fg)]/8">
        <h3 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">
          Histórico {ano}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {historicoMeses.map(({ m, total, feitas, pct }) => {
            const isAtual = m === mes && ano === anoAtual
            return (
              <div
                key={m}
                className={`p-3 rounded-xl border text-center ${
                  isAtual
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40'
                    : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
                }`}
              >
                <p className="text-xs text-[var(--fg)]/50 mb-1">{MESES_ABREV[m-1]}</p>
                <p className={`text-lg font-bold ${pct === 100 ? 'text-[var(--accent)]' : pct > 0 ? 'text-[var(--fg)]' : 'text-[var(--fg)]/20'}`}>{pct}%</p>
                <p className="text-xs text-[var(--fg)]/30">{feitas}/{total}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
