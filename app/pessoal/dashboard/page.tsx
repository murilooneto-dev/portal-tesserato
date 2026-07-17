// app/pessoal/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Profile, Tarefa, CalendarioEvento } from '@/lib/types'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import { proximaOcorrencia, diasRestantes, alertaColor, alertaLabel } from '@/lib/calendario'

export const metadata = { title: 'Dashboard — Tesserato Pessoal' }

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function DashboardPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'pessoal'),
    supabase.from('calendario_eventos').select('*').eq('setor', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal'),
  ])

  const cs = (clientesRaw ?? []).map(flattenClientePessoal)
  const ps = (profiles ?? []) as Profile[]
  const ts = tarefas
  const eventos = (eventosRaw ?? []) as CalendarioEvento[]

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTarefasVisiveis(c.tarefas_personalizadas ?? [], mesesVisiveisPorTipo, mes))
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0

  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const alertas = ehMesAtual
    ? eventos
        .map(evento => {
          const alvo = proximaOcorrencia(evento, hoje)
          const dias = diasRestantes(alvo, hoje)
          return { evento, dias }
        })
        .filter(a => a.dias >= 0 && a.dias <= 10)
        .sort((a, b) => a.dias - b.dias)
    : []

  const clientesObs = cs.filter(c => c.obs && c.obs.trim() !== '')
  const responsaveis = Array.from(
    new Set(cs.map(c => c.responsavel).filter(Boolean) as string[])
  ).sort()

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Dashboard</h1>
        <p className="text-sm text-[var(--fg)]/40 mt-1">{MESES_PT[mes - 1]} {ano}</p>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-2">
            {alertas.map(a => {
              const lbl = alertaLabel(a.dias)
              return (
                <div key={a.evento.id} className={`rounded-full border px-3 py-1.5 flex items-center gap-2.5 ${alertaColor(a.dias)}`}>
                  <span className="text-[var(--fg)] text-xs font-semibold">{a.evento.titulo}</span>
                  <span className="text-[var(--fg)]/25 text-xs">·</span>
                  <span className={`text-xs font-bold ${lbl.cls}`}>{lbl.text}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Linha 1: Progresso Geral + Clientes */}
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 p-5">
          <p className="text-xs text-[var(--fg)]/40 uppercase tracking-wider mb-2">Progresso Geral</p>
          <p className="text-3xl font-bold text-[var(--fg)]">{pct}%</p>
          <div className="w-full h-2 bg-[var(--fg)]/8 rounded-full mt-3 mb-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), #0066cc)' }} />
          </div>
          <p className="text-sm text-[var(--fg)]/35">{concluidasTarefas}/{totalTarefas} tarefas concluídas</p>
        </div>

        <div className="rounded-2xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 p-5">
          <p className="text-xs text-[var(--fg)]/40 uppercase tracking-wider mb-2">Total de Clientes</p>
          <p className="text-3xl font-bold text-[var(--fg)]">{cs.length}</p>
        </div>
      </section>

      {/* Progresso por responsável */}
      {responsaveis.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">Progresso por Responsável</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {responsaveis.map(nome => {
              const perfil      = ps.find(p => p.nome?.toUpperCase() === nome.toUpperCase())
              const cor         = perfil?.cor || 'var(--accent)'
              const opClientes  = cs.filter(c => c.responsavel?.toUpperCase() === nome.toUpperCase())
              const opTarefas   = ts.filter(t => opClientes.some(c => c.id === t.cliente_id))
              const opConcluidas = opTarefas.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
              const opTotal     = opClientes.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
              const opPct       = opTotal > 0 ? Math.round((opConcluidas / opTotal) * 100) : 0
              return (
                <div key={nome} className="rounded-2xl bg-[var(--fg)]/2 border border-[var(--fg)]/7 p-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--fg)] text-xs font-bold shrink-0"
                      style={{ backgroundColor: cor }}>
                      {nome.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm text-[var(--fg)]/70 font-medium truncate">{nome}</p>
                  </div>
                  <p className="text-3xl font-bold text-[var(--fg)]">{opPct}%</p>
                  <div className="w-full h-2 bg-[var(--fg)]/8 rounded-full mt-3 mb-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${opPct}%`, backgroundColor: cor }} />
                  </div>
                  <p className="text-sm text-[var(--fg)]/35">{opConcluidas}/{opTotal} · {opClientes.length} clientes</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Clientes com observações */}
      {clientesObs.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">Clientes com Observações</h2>
          <div className="flex flex-col gap-2">
            {clientesObs.map(c => (
              <Link key={c.id} href={`/pessoal/clientes/${c.id}`}
                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--fg)] font-medium truncate">{c.nome}</p>
                  <p className="text-xs text-yellow-400/60 mt-0.5 truncate">{c.obs}</p>
                </div>
                <span className="text-[var(--fg)]/20 text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
