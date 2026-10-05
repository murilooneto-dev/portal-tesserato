// app/contabil/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CalendarClock, CheckCircle2, ChevronRight, StickyNote } from 'lucide-react'
import { Pagina, CabecalhoPagina, Card, Badge, EmptyState, type BadgeTom } from '@/components/ui'
import { buttonClassName } from '@/components/ui/Button'
import DashboardVisao from '@/components/fiscal/DashboardVisao'
import { Profile, Tarefa, CalendarioEvento } from '@/lib/types'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { proximoPrazo, diasRestantes, alertaLabel, labelDatas } from '@/lib/calendario'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { calcularMeu, visaoDaUrl } from '@/lib/dashboard-meu'

export const metadata = { title: 'Dashboard — Tesserato Contábil' }

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const KPI = 'min-w-0 rounded-xl border border-line-soft bg-surface p-[18px]'
const KPI_ROTULO = 'text-sm font-medium text-fg-3'
const KPI_VALOR = 'mt-1 text-[32px] font-semibold leading-tight tabular-nums text-fg'

function Barra({ pct, cor = 'var(--acc)', rotulo }: { pct: number; cor?: string; rotulo: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-inset" role="progressbar" aria-label={rotulo} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
    </div>
  )
}

function tomDoPrazo(dias: number): BadgeTom {
  if (dias <= 1) return 'dng'
  if (dias <= 5) return 'warn'
  if (dias <= 10) return 'info'
  return 'neu'
}

export default async function DashboardContabilPage({ searchParams }: { searchParams: Promise<{ visao?: string | string[] }> }) {
  const visao = visaoDaUrl((await searchParams).visao)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { mes, ano } = await getMesAno()
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('clientes_contabil.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'contabil'),
    supabase.from('calendario_eventos').select('*').eq('setor', 'contabil'),
  ])

  const cs = (clientesRaw ?? []).map(flattenClienteContabil)
  const ps = (profiles ?? []) as Profile[]
  const ts = tarefas
  const eventos = (eventosRaw ?? []) as CalendarioEvento[]
  const nomeUsuario = ps.find(p => p.id === user?.id)?.nome ?? null

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
  }

  // Contábil não tem tarefa encaminhada a outro usuário: o modo Meu usa a própria %
  // do setor, só filtrada para os clientes em que o usuário logado é responsável.
  const meu = visao === 'meu'
    ? calcularMeu({ clientes: cs, nomeUsuario, tarefas: ts, tiposDoProgresso: tiposMap, tiposBrutos: tiposMap, donoNomePorTipo: {} })
    : null
  const clientesVisao = meu ? meu.clientes : cs

  const totalTarefas = meu ? meu.total : cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = meu ? meu.concluidas : ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0

  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const alertas = ehMesAtual
    ? eventos
        .map(evento => ({ evento, alvo: proximoPrazo(evento, hoje) }))
        .filter((a): a is { evento: CalendarioEvento; alvo: Date } => a.alvo !== null)
        .map(({ evento, alvo }) => ({ evento, alvo, dias: diasRestantes(alvo, hoje) }))
        .filter(a => a.dias >= 0 && a.dias <= 10)
        .sort((a, b) => a.dias - b.dias)
    : []

  const clientesObs = clientesVisao.filter(c => c.obs && c.obs.trim() !== '')
  const responsaveis = Array.from(
    new Set(ps.filter(p => p.setores.includes('contabil') && p.role === 'operador').map(p => p.nome).filter(Boolean))
  ).sort()
  const totalPendentes = meu ? meu.pendencias.reduce((s, p) => s + p.tipos.length, 0) : 0

  return (
    <Pagina className="mx-auto w-full max-w-6xl">
      <CabecalhoPagina
        titulo="Dashboard"
        subtitulo={meu ? `Seus clientes e tarefas em ${MESES_PT[mes - 1]} ${ano}` : `Visão do setor Contábil em ${MESES_PT[mes - 1]} ${ano}`}
        acoes={<DashboardVisao visao={visao} base="/contabil/dashboard" />}
        className="max-sm:[&>div:last-child]:ml-0 max-sm:[&>div:last-child]:w-full"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className={KPI}>
          <p className={KPI_ROTULO}>{meu ? 'Meu progresso' : 'Progresso geral'}</p>
          <p className={KPI_VALOR}>{pct}%</p>
          <div className="mb-2 mt-3"><Barra pct={pct} rotulo={meu ? 'Meu progresso' : 'Progresso geral'} /></div>
          <p className="text-[13px] text-fg-2">{concluidasTarefas} de {totalTarefas} tarefas concluídas</p>
        </section>

        {/* Celular (mob-09): Clientes e Com observação lado a lado. */}
        <div className="grid grid-cols-2 gap-4 md:hidden">
          <section className={KPI}>
            <p className={KPI_ROTULO}>{meu ? 'Meus clientes' : 'Clientes'}</p>
            <p className={KPI_VALOR}>{clientesVisao.length}</p>
          </section>
          <section className={KPI}>
            <p className={KPI_ROTULO}>Com observação</p>
            <p className={KPI_VALOR}>{clientesObs.length}</p>
          </section>
        </div>

        <section className={`${KPI} hidden md:block`}>
          <p className={KPI_ROTULO}>{meu ? 'Meus clientes' : 'Clientes ativos'}</p>
          <p className={KPI_VALOR}>{clientesVisao.length}</p>
          {!meu && <p className="text-[13px] text-fg-2">no Contábil</p>}
        </section>

        <section className={KPI}>
          <p className={KPI_ROTULO}>Próximos prazos</p>
          {alertas.length === 0 ? (
            <EmptyState
              compacto
              icone={<CalendarClock size={20} />}
              titulo={ehMesAtual ? 'Nenhum prazo nos próximos 10 dias' : 'Os prazos aparecem só no mês atual'}
              acao={
                <Link href="/contabil/calendario" className={buttonClassName({ variante: 'fantasma', tamanho: 'p' })}>
                  Ver calendário <ChevronRight size={14} aria-hidden="true" />
                </Link>
              }
            />
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
          >
            {meu.pendencias.length === 0 ? (
              <EmptyState compacto icone={<CheckCircle2 size={20} />} titulo="Nada pendente" descricao="Todas as suas tarefas do mês estão concluídas." />
            ) : (
              <ul>
                {meu.pendencias.map((p, i) => (
                  <li key={p.cliente.id} className={i ? 'border-t border-line-soft' : ''}>
                    <Link href={`/contabil/clientes/${p.cliente.id}`} className="flex flex-col gap-2.5 px-[18px] py-3.5 hover:bg-inset">
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
                      <div className="mb-1.5 mt-2"><Barra pct={opPct} cor={cor} rotulo={`Progresso de ${nome}`} /></div>
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
            <EmptyState compacto icone={<StickyNote size={20} />} titulo="Nenhum cliente com observação" descricao="As observações anotadas na ficha dos clientes aparecem aqui." />
          ) : (
            <ul>
              {clientesObs.map((c, i) => (
                <li key={c.id} className={i ? 'border-t border-line-soft' : ''}>
                  <Link href={`/contabil/clientes/${c.id}`} className="flex items-center gap-3.5 px-[18px] py-3.5 hover:bg-inset">
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
