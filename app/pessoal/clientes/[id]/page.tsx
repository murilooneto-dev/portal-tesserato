import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, CreditCard } from 'lucide-react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'
import { Badge } from '@/components/ui/Badge'
import AbasFichaSetor from '@/components/geral/AbasFichaSetor'
import { createClient, createClienteLeituraVinculos } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'
import { buscarTarefasAvulsasDoMes } from '@/lib/tarefas-avulsas'
import { normalizarTitulo, prazoOperacional, diasRestantes } from '@/lib/calendario'
import TarefaChecklistPessoal from '@/components/pessoal/TarefaChecklistPessoal'
import SeletorMesFicha from '@/components/contabil/SeletorMesFicha'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import ClientePessoalAcoes from '@/components/pessoal/ClientePessoalAcoes'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import ClienteNotas from '@/components/geral/ClienteNotas'
import { toggleTarefaPessoal, atualizarEtapa, salvarRespostaTexto, uploadArquivoTarefa, excluirArquivoTarefa, adicionarNotaCliente, editarNotaCliente, excluirNotaCliente, marcarSemMovimento } from '../actions'
import { buscarNotasCliente } from '@/lib/cliente-notas'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta, CalendarioEvento, TarefaGrupo } from '@/lib/types'
import { labelRegime } from '@/lib/atividades-regimes'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import HistoricoResponsavel from '@/components/HistoricoResponsavel'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string; ano?: string }>
}

// Abas da ficha no celular (no desktop vira duas colunas). Sem "Arquivos": o setor não tem arquivos na ficha.
const ABAS_FICHA = [
  { id: 'tarefas', rotulo: 'Tarefas' },
  { id: 'eventos', rotulo: 'Eventos' },
  { id: 'observacoes', rotulo: 'Observações' },
  { id: 'historico', rotulo: 'Histórico' },
]

export default async function ClientePessoalDetalhePage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role,setores').eq('id', user.id).single()

  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClientePessoal(clienteRaw)

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()
  // Desabilitar vale para a empresa em todos os setores: só Admin e Societário (regra do Cadastro de clientes).
  const podeDesabilitar = profile?.role === 'admin' || (profile?.setores ?? []).includes('societario')

  // ?mes&ano troca só o mês que a ficha mostra (seletor da própria ficha); sem eles vale o mês de trabalho.
  const mesParam = Number(sp.mes)
  const anoParam = Number(sp.ano)
  const override = mesParam >= 1 && mesParam <= 12 && anoParam > 2000 && anoParam < 3000
    ? { mes: mesParam, ano: anoParam }
    : null
  const { mes, ano } = override ?? await getMesAno()
  await sincronizarTarefasParcelamento(supabase, 'pessoal', mes, ano)
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const [{ data: tarefas }, { data: usuariosPessoal }, { data: tiposRaw }, labelsParcelamento, { data: gruposRaw }] = await Promise.all([
    supabase.from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'pessoal'),
    supabase.from('profiles').select('nome, cor').contains('setores', ['pessoal']),
    supabase.from('tarefa_tipos').select('nome, etapas, meses_visiveis, tipo_resposta').eq('setor', 'pessoal'),
    buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null),
    supabase.from('tarefa_grupos').select('id, cliente_id, setor, nome, tarefas').eq('cliente_id', id).eq('setor', 'pessoal'),
  ])

  const parcelamentoIdsDaFicha = Array.from(new Set(
    (tarefas ?? []).filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsDaFicha)
  const tiposDeParcelamento = Array.from(new Set(
    (tarefas ?? []).filter(t => t.parcelamento_id && parcelamentosAtivos.has(t.parcelamento_id)).map(t => t.tipo)
  ))
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal', { mes, ano })
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
  const notas = await buscarNotasCliente(supabase, id, 'pessoal')

  const vinculos = await buscarVinculosDoCliente(
    await createClienteLeituraVinculos(), id, cliente.tarefas_vinculadas_ativas ?? [], 'pessoal', mes, ano
  )

  const responsaveis = Array.from(new Set(
    (usuariosPessoal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
  // Cor do avatar do responsável (a mesma do Progresso por responsável no dashboard).
  const corResponsavel = (usuariosPessoal ?? []).find(p => p.nome?.toUpperCase() === cliente.responsavel?.toUpperCase())?.cor || 'var(--acc)'

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

  // % por mês do cliente no ano para o seletor: mesma conta da lista de clientes do Pessoal
  // (tarefas visíveis no mês por meses_visiveis + parcelamentos ativos naquele mês).
  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null
  const { data: tarefasDoAno } = await supabase
    .from('tarefas').select('mes, concluida, tipo, parcelamento_id')
    .eq('cliente_id', id).eq('ano', ano).eq('setor', 'pessoal')
  const parcelamentoIdsDoAno = Array.from(new Set(
    (tarefasDoAno ?? []).filter(t => t.parcelamento_id).map(t => t.parcelamento_id as string)
  ))
  const parcelamentosAtivosDoAno = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsDoAno)
  const progressoFicha: Record<number, number | null> = {}
  for (let m = 1; m <= 12; m++) {
    const doMes = (tarefasDoAno ?? []).filter(t => t.mes === m)
    const tiposParcelamento = doMes
      .filter(t => t.parcelamento_id && parcelamentosAtivosDoAno.has(t.parcelamento_id))
      .map(t => t.tipo)
    const esperados = new Set([
      ...filtrarTarefasVisiveis(calcularTarefasEsperadas(cliente, mapaVinculos, { mes: m, ano }), mesesVisiveisPorTipo, m),
      ...tiposParcelamento,
    ])
    const concluidas = doMes.filter(t => t.concluida && esperados.has(t.tipo)).length
    progressoFicha[m] = esperados.size > 0 ? Math.round((concluidas / esperados.size) * 100) : null
  }

  async function onToggleSimples(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaPessoal(id, tipo, mes, ano, concluida, data)
  }

  async function onMarcarSemMovimento(tipo: string, semMovimento: boolean) {
    'use server'
    await marcarSemMovimento(id, tipo, mes, ano, semMovimento)
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
        <Link href="/pessoal/clientes" className="flex-none transition-colors hover:text-fg">Clientes</Link>
        <ChevronRight size={14} aria-hidden="true" className="flex-none" />
        <b className="min-w-0 truncate font-medium text-fg-2" aria-current="page">{cliente.nome}</b>
      </nav>

      <CabecalhoPagina
        titulo={<span className="block min-w-[15ch] truncate" title={cliente.nome}>{cliente.nome}</span>}
        subtitulo={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="font-mono text-[13px]">{cliente.cnpj?.trim() || 'CNPJ não informado'}</span>
            {cliente.regime && <Badge tom="acc">{labelRegime(cliente.regime)}</Badge>}
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
          podeEditar
            ? <ClientePessoalAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} catalogo={catalogo} podeDesabilitar={podeDesabilitar} />
            : undefined
        }
      />

      {labelsParcelamento.length > 0 && (
        <Aviso tom="warn" icone={<CreditCard size={18} />}>
          <b>Este cliente possui parcelamento:</b> {labelsParcelamento.join(' / ')}.
        </Aviso>
      )}

      <AbasFichaSetor
        abas={ABAS_FICHA}
        principal={[
          {
            chave: 'tarefas',
            aba: 'tarefas',
            conteudo: (
              <TarefaChecklistPessoal
                tarefasPersonalizadas={tarefasPersonalizadasEfetivas}
                seletorMes={<SeletorMesFicha mes={mes} ano={ano} basePath={`/pessoal/clientes/${id}`} progresso={progressoFicha} />}
                grupos={(gruposRaw ?? []) as TarefaGrupo[]}
                tarefaTipos={tarefaTipos}
                tarefas={(tarefas ?? []) as Tarefa[]}
                etapas={(etapas ?? []) as TarefaEtapa[]}
                arquivos={(arquivos ?? []) as Omit<TarefaArquivo, 'content_base64'>[]}
                vinculos={vinculos}
                mes={mes}
                ano={ano}
                onToggleSimples={onToggleSimples}
                onMarcarSemMovimento={onMarcarSemMovimento}
                onAtualizarEtapa={onAtualizarEtapa}
                onSalvarTexto={onSalvarTexto}
                onUploadArquivo={onUploadArquivo}
                onExcluirArquivo={onExcluirArquivo}
                podeEditar={podeEditar}
                prazosPorTipo={prazosPorTipo}
              />
            ),
          },
        ]}
        lateral={[
          {
            chave: 'eventos',
            aba: 'eventos',
            conteudo: <EventosAvulsosSecao clienteId={id} setor="pessoal" eventos={eventosAvulsos} podeEditar={podeEditar} mes={mes} />,
          },
          {
            chave: 'observacoes',
            aba: 'observacoes',
            conteudo: <ClienteNotas clienteId={id} setor="pessoal" notas={notas} podeEditar={podeEditar} adicionarNota={adicionarNotaCliente} editarNota={editarNotaCliente} excluirNota={excluirNotaCliente} />,
          },
          { chave: 'historico', aba: 'historico', conteudo: <HistoricoResponsavel clienteId={id} setor="pessoal" /> },
        ]}
      />
    </Pagina>
  )
}
