import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, StickyNote } from 'lucide-react'
import { Pagina, CabecalhoPagina, Card, Badge, EmptyState, type BadgeTom } from '@/components/ui'
import DashboardVisao from '@/components/fiscal/DashboardVisao'
import { Profile, Tarefa, CalendarioEvento } from '@/lib/types'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { proximoPrazo, diasRestantes, alertaLabel, labelDatas } from '@/lib/calendario'
import { sincronizarTarefasParcelamento, idsDeParcelamentosAtivos } from '@/lib/parcelamento-tarefas'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { bucketDoRegime } from '@/lib/regime-bucket'
import { buscarDonoNomePorTipoFiscal } from '@/lib/tarefa-tipo-donos-actions'
import { filtrarTiposDoProgresso } from '@/lib/tarefa-tipo-visibilidade'
import { calcularMeu, visaoDaUrl } from '@/lib/dashboard-meu'

export const metadata = { title: 'Dashboard — Tesserato Fiscal' }

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const REGIMES = [
  { chave: 'normal', rotulo: 'Regime normal', cor: 'var(--info)' },
  { chave: 'simples', rotulo: 'Simples Nacional', cor: 'var(--ok)' },
  { chave: 'mei', rotulo: 'MEI', cor: 'var(--warn)' },
  { chave: 'isento', rotulo: 'Isento', cor: 'var(--fg-3)' },
] as const

function tomDoPrazo(dias: number): BadgeTom {
  if (dias <= 1) return 'dng'
  if (dias <= 5) return 'warn'
  if (dias <= 10) return 'info'
  return 'neu'
}

function Barra({ pct, cor = 'var(--acc)' }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-inset" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
    </div>
  )
}

const KPI = 'min-w-0 rounded-xl border border-line-soft bg-surface p-[18px]'
const KPI_ROTULO = 'text-sm font-medium text-fg-3'
const KPI_VALOR = 'mt-1 text-[32px] font-semibold leading-tight tabular-nums text-fg'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ visao?: string | string[] }> }) {
  const visao = visaoDaUrl((await searchParams).visao)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { mes, ano } = await getMesAno()
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  await sincronizarTarefasParcelamento(supabase, 'fiscal', mes, ano)

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano),
    supabase.from('calendario_eventos').select('*').eq('setor', 'fiscal'),
  ])

  const cs = (clientesRaw ?? []).map(flattenClienteFiscal)
  const ps = (profiles ?? []) as Profile[]
  const ts = tarefas
  const eventos = (eventosRaw ?? []) as CalendarioEvento[]
  const nomeUsuario = ps.find(p => p.id === user?.id)?.nome ?? null

  // Mapa de tipos válidos por cliente — inclui as tarefas geradas por
  // parcelamento (nome dinâmico, não cadastrado em tarefas_personalizadas).
  const parcelamentoIdsDoMes = Array.from(new Set(
    ts.filter((t): t is typeof t & { parcelamento_id: string } => !!t.parcelamento_id).map(t => t.parcelamento_id)
  ))
  const parcelamentosAtivos = await idsDeParcelamentosAtivos(supabase, parcelamentoIdsDoMes)

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
  }
  for (const t of ts) {
    if (t.parcelamento_id && parcelamentosAtivos.has(t.parcelamento_id)) tiposMap[t.cliente_id]?.add(t.tipo)
  }

  // Tipo encaminhado a outro usuário (Minhas Tarefas) não entra na % do cliente.
  // Cópia rasa antes do filtro: o modo Meu precisa dos tipos completos.
  const tiposBrutos = { ...tiposMap }
  const donoNomePorTipo = await buscarDonoNomePorTipoFiscal()
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTiposDoProgresso(tiposMap[c.id], c.responsavel, donoNomePorTipo))
  }

  const alertas = ehMesAtual
    ? eventos
        .map(evento => ({ evento, alvo: proximoPrazo(evento, hoje) }))
        .filter((a): a is { evento: CalendarioEvento; alvo: Date } => a.alvo !== null)
        .map(({ evento, alvo }) => ({ evento, alvo, dias: diasRestantes(alvo, hoje) }))
        .filter(a => a.dias >= 0 && a.dias <= 10)
        .sort((a, b) => a.dias - b.dias)
    : []

  // Visão: Setor usa tudo; Meu filtra os mesmos números para o usuário logado.
  const meu = visao === 'meu'
    ? calcularMeu({ clientes: cs, nomeUsuario, tarefas: ts, tiposDoProgresso: tiposMap, tiposBrutos, donoNomePorTipo })
    : null
  const clientesVisao = meu ? meu.clientes : cs

  const totalTarefas = meu ? meu.total : cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = meu ? meu.concluidas : ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0

  const porRegime = REGIMES.map(r => ({ ...r, qtd: clientesVisao.filter(c => bucketDoRegime(c.regime) === r.chave).length }))

  const clientesObs = clientesVisao.filter(c => c.obs && c.obs.trim() !== '')
  const responsaveis = Array.from(
    new Set(ps.filter(p => p.setores.includes('fiscal') && p.role === 'operador').map(p => p.nome).filter(Boolean))
  ).sort()
  const totalPendentes = meu ? meu.pendencias.reduce((s, p) => s + p.tipos.length, 0) : 0

  return (
    <Pagina className="mx-auto w-full max-w-6xl">
      <CabecalhoPagina
        titulo="Dashboard"
        subtitulo={meu ? `Seus clientes e tarefas em ${MESES_PT[mes - 1]} ${ano}` : `Visão do setor Fiscal em ${MESES_PT[mes - 1]} ${ano}`}
        acoes={<DashboardVisao visao={visao} />}
        className="max-sm:[&>div:last-child]:ml-0 max-sm:[&>div:last-child]:w-full"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className={KPI}>
          <p className={KPI_ROTULO}>{meu ? 'Meu progresso' : 'Progresso geral'}</p>
          <p className={KPI_VALOR}>{pct}%</p>
          <div className="mb-2 mt-3"><Barra pct={pct} /></div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="text-fg-2">{concluidasTarefas} de {totalTarefas} tarefas concluídas</span>
            {!meu && (
              <Link href="/fiscal/tarefas" className="ml-auto inline-flex items-center gap-1 font-semibold text-acc-text hover:underline">
                Ver tarefas do mês <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        <section className={KPI}>
          <p className={KPI_ROTULO}>{meu ? 'Meus clientes' : 'Clientes ativos'}</p>
          <p className={KPI_VALOR}>{clientesVisao.length}</p>
          <div className="mb-2.5 mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-inset">
            {porRegime.filter(r => r.qtd > 0).map(r => (
              <i key={r.chave} style={{ flex: r.qtd, backgroundColor: r.cor }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            {porRegime.map(r => (
              <li key={r.chave} className="flex min-w-0 items-center gap-2 text-fg-2">
                <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: r.cor }} />
                <span className="truncate">{r.rotulo}</span>
                <b className="ml-auto font-semibold tabular-nums text-fg">{r.qtd}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className={KPI}>
          <p className={KPI_ROTULO}>Próximos prazos</p>
          {alertas.length === 0 ? (
            <p className="mt-3 text-sm text-fg-3">{ehMesAtual ? 'Nenhum prazo nos próximos 10 dias.' : 'Os prazos aparecem só no mês atual.'}</p>
          ) : (
            <ul className="mt-2">
              {alertas.map((a, i) => (
                <li key={a.evento.id} className={`flex items-center gap-3.5 py-2.5 ${i ? 'border-t border-line-soft' : ''}`}>
                  <div className="w-11 flex-none text-center">
                    <div className="text-xl font-semibold leading-none tabular-nums text-fg">{String(a.alvo.getDate()).padStart(2, '0')}</div>
                    <div className="text-xs text-fg-3">{MESES_PT[a.alvo.getMonth()].slice(0, 3).toLowerCase()}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fg" title={a.evento.titulo}>{a.evento.titulo}</div>
                    <div className="truncate text-[13px] text-fg-3">{labelDatas(a.evento, hoje)}</div>
                  </div>
                  <Badge tom={tomDoPrazo(a.dias)}>{alertaLabel(a.dias).text}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {meu ? (
          <Card
            titulo="O que falta fazer"
            semPadding
            meta={<Badge tom={totalPendentes > 0 ? 'warn' : 'ok'}>{totalPendentes > 0 ? `${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}` : 'Tudo em dia'}</Badge>}
            acoes={
              <Link href="/fiscal/minhas-tarefas" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-acc-text hover:underline">
                Abrir Minhas tarefas <ChevronRight size={14} aria-hidden="true" />
              </Link>
            }
          >
            {meu.pendencias.length === 0 ? (
              <EmptyState icone={<StickyNote size={22} />} titulo="Nada pendente" descricao="Todas as suas tarefas do mês estão concluídas." />
            ) : (
              <ul>
                {meu.pendencias.map((p, i) => (
                  <li key={p.cliente.id} className={i ? 'border-t border-line-soft' : ''}>
                    <Link href={`/fiscal/clientes/${p.cliente.id}`} className="flex flex-col gap-2.5 px-[18px] py-3.5 hover:bg-inset">
                      <span className="truncate font-semibold text-fg" title={p.cliente.nome}>{p.cliente.nome}</span>
                      <span className="flex flex-wrap gap-2">
                        {p.tipos.map(t => <Badge key={t} tom="warn">{t}</Badge>)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : responsaveis.length > 0 && (
          <Card titulo="Progresso por responsável" semPadding>
            <ul>
              {responsaveis.map((nome, i) => {
                const perfil = ps.find(p => p.nome?.toUpperCase() === nome.toUpperCase())
                const cor = perfil?.cor || 'var(--acc)'
                const opClientes = cs.filter(c => c.responsavel?.toUpperCase() === nome.toUpperCase())
                const opTarefas = ts.filter(t => opClientes.some(c => c.id === t.cliente_id))
                const opConcluidas = opTarefas.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
                const opTotal = opClientes.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
                const opPct = opTotal > 0 ? Math.round((opConcluidas / opTotal) * 100) : 0
                return (
                  <li key={nome} className={`flex items-center gap-3.5 px-[18px] py-3.5 ${i ? 'border-t border-line-soft' : ''}`}>
                    <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full text-sm font-semibold text-acc-ink" style={{ backgroundColor: cor }}>
                      {nome.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <b className="truncate font-semibold text-fg">{nome}</b>
                        <span className="ml-auto font-semibold tabular-nums text-fg">{opPct}%</span>
                      </div>
                      <div className="mb-1.5 mt-2"><Barra pct={opPct} cor={cor} /></div>
                      <p className="text-[13px] text-fg-3">{opConcluidas} de {opTotal} tarefas · {opClientes.length} cliente{opClientes.length === 1 ? '' : 's'}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <Card
          titulo={meu ? 'Meus clientes com observação' : 'Clientes com observação'}
          semPadding
          meta={!meu ? <Badge>{clientesObs.length}</Badge> : undefined}
        >
          {clientesObs.length === 0 ? (
            <p className="px-[18px] py-6 text-sm text-fg-3">Nenhum cliente com observação.</p>
          ) : (
            <ul>
              {clientesObs.map((c, i) => (
                <li key={c.id} className={i ? 'border-t border-line-soft' : ''}>
                  <Link href={`/fiscal/clientes/${c.id}`} className="flex items-center gap-3.5 px-[18px] py-3.5 hover:bg-inset">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-fg" title={c.nome}>{c.nome}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-warn">
                        <StickyNote size={14} aria-hidden="true" className="flex-none" />
                        <span className="truncate">{c.obs}</span>
                      </div>
                    </div>
                    <ChevronRight size={18} aria-hidden="true" className="flex-none text-fg-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Pagina>
  )
}
