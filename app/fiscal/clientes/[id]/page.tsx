import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, CreditCard } from 'lucide-react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'
import { Badge } from '@/components/ui/Badge'
import { createClient, createClienteLeituraVinculos } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
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
import AbasFichaCelular from '@/components/fiscal/AbasFichaCelular'
import ClienteAcoes from '@/components/fiscal/ClienteAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import { bucketDoRegime } from '@/lib/regime-bucket'
import HistoricoResponsavel from '@/components/HistoricoResponsavel'

interface Props {
  params: Promise<{ id: string }>
}

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
    await createClienteLeituraVinculos(), id, cliente.tarefas_vinculadas_ativas ?? [], 'fiscal', mes, ano
  )

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
  const { data: usuariosFiscal } = await supabase.from('profiles').select('nome, cor').contains('setores', ['fiscal'])
  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
  // Cor do avatar do responsável (a mesma do Progresso por responsável no dashboard).
  const corResponsavel = (usuariosFiscal ?? []).find(p => p.nome?.toUpperCase() === cliente.responsavel?.toUpperCase())?.cor || 'var(--acc)'
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

  return (
    <Pagina>
      <nav aria-label="Caminho" className="-mb-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3 print:hidden">
        <Link href="/fiscal/clientes" className="flex-none transition-colors hover:text-fg">Clientes</Link>
        <ChevronRight size={14} aria-hidden="true" className="flex-none" />
        <b className="min-w-0 truncate font-medium text-fg-2" aria-current="page">{cliente.nome}</b>
      </nav>

      <CabecalhoPagina
        titulo={<span className="block min-w-[15ch] truncate" title={cliente.nome}>{cliente.nome}</span>}
        subtitulo={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="font-mono text-[13px]">{cliente.cnpj?.trim() || 'CNPJ não informado'}</span>
            {cliente.regime && <Badge tom="acc">{cliente.regime}</Badge>}
            {(cliente.atividade ?? []).map(a => <Badge key={a}>{a}</Badge>)}
            {cliente.responsavel && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-2">
                <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full text-xs font-bold text-acc-ink" style={{ backgroundColor: corResponsavel }}>
                  {cliente.responsavel.charAt(0).toUpperCase()}
                </span>
                {cliente.responsavel}
              </span>
            )}
            {cliente.municipio && <Badge>{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</Badge>}
            {cliente.ativo === false && <Badge tom="warn">Desabilitado</Badge>}
          </span>
        }
        acoes={
          podeEditar ? <ClienteAcoes cliente={cliente} responsaveis={responsaveis} catalogo={catalogo} /> : undefined
        }
      />

      {labelsParcelamento.length > 0 && (
        <Aviso tom="warn" icone={<CreditCard size={18} />}>
          <b>Este cliente possui parcelamento:</b> {labelsParcelamento.join(' / ')}.{' '}
          <Link href="/fiscal/parcelamentos" className="font-semibold text-acc-text underline-offset-2 hover:underline print:hidden">Ver parcelamentos</Link>
        </Aviso>
      )}

      <AbasFichaCelular
        principal={[
          {
            chave: 'tarefas',
            aba: 'tarefas',
            conteudo: (
              <TarefaChecklist
                clienteId={id}
                grupo={bucketDoRegime(cliente.regime)}
                tarefasPersonalizadas={tarefasPersonalizadasVisiveis}
                tarefas={tarefas ?? []}
                grupos={(gruposRaw ?? []) as TarefaGrupo[]}
                vinculos={vinculos}
                mes={mes}
                ano={ano}
                usuarioId={user.id}
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
            ),
          },
          {
            chave: 'eventos',
            aba: 'eventos',
            conteudo: <EventosAvulsosSecao clienteId={id} setor="fiscal" eventos={eventosAvulsos} podeEditar={podeEditar} />,
          },
          {
            chave: 'conferencia',
            aba: 'arquivos',
            conteudo: (
              <ClienteConferencia
                clienteNome={cliente.nome}
                arquivosDTE={(arquivos ?? []).filter(a => /\.xlsx?$/i.test(a.name)).map(a => ({ id: a.id, name: a.name, content_base64: a.content_base64 ?? '' }))}
              />
            ),
          },
        ]}
        lateral={[
          {
            chave: 'observacao',
            aba: 'tarefas',
            conteudo: <ClienteObs clienteId={id} obsInicial={observacao?.texto ?? ''} mes={mes} ano={ano} podeEditar={podeEditar} />,
          },
          { chave: 'historico', aba: 'historico', conteudo: <HistoricoResponsavel clienteId={id} setor="fiscal" /> },
          {
            chave: 'arquivos',
            aba: 'arquivos',
            conteudo: <ClienteArquivos clienteId={id} arquivosIniciais={arquivos ?? []} podeEditar={podeEditar} />,
          },
        ]}
      />
    </Pagina>
  )
}
