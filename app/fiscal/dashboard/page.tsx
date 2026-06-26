import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Cliente, Profile, Tarefa } from '@/lib/types'

export const metadata = { title: 'Dashboard — Tesserato Fiscal' }

function getMesAno() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return { mes: now.getMonth() + 1, ano: now.getFullYear(), hoje: now }
}

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const OBRIGACOES_CAL = [
  { nome: 'SIGET', dia: 5 },
  { nome: 'SPEED GOV', dia: 10 },
  { nome: 'EFD-Reinf', dia: 15 },
  { nome: 'DAS/PGDAS-D', dia: 15 },
  { nome: 'ISS', dia: 15 },
  { nome: 'ICMS/ICMS-ST', dia: 15 },
  { nome: 'PIS/COFINS', dia: 20 },
  { nome: 'DCTFWeb', dia: 20 },
  { nome: 'IRPJ/CSLL', dia: 20 },
  { nome: 'EFD-Contribuições', dia: -1 },
]

function alertaColor(diff: number) {
  if (diff < 0) return 'border-red-500 bg-red-500/10'
  if (diff <= 3) return 'border-orange-500 bg-orange-500/10'
  if (diff <= 7) return 'border-blue-500 bg-blue-500/10'
  return 'border-green-500/60 bg-green-500/10'
}

function alertaLabel(diff: number) {
  if (diff < 0) return { text: `Vencido há ${Math.abs(diff)}d`, cls: 'text-red-400' }
  if (diff === 0) return { text: 'Vence hoje', cls: 'text-orange-400' }
  if (diff <= 3) return { text: `${diff}d restantes`, cls: 'text-orange-400' }
  if (diff <= 7) return { text: `${diff}d restantes`, cls: 'text-blue-400' }
  return { text: `${diff}d restantes`, cls: 'text-green-400' }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { mes, ano, hoje } = getMesAno()

  const [{ data: clientes }, { data: profiles }, { data: tarefas }] = await Promise.all([
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('profiles').select('*'),
    supabase.from('tarefas').select('*').eq('mes', mes).eq('ano', ano),
  ])

  const cs = (clientes ?? []) as Cliente[]
  const ps = (profiles ?? []) as Profile[]
  const ts = (tarefas ?? []) as Tarefa[]

  const totalTarefas = ts.length
  const concluidasTarefas = ts.filter(t => t.concluida).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0

  const normal  = cs.filter(c => c.regime?.toLowerCase() === 'normal').length
  const simples = cs.filter(c => c.regime?.toLowerCase().includes('simples')).length
  const mei     = cs.filter(c => c.regime?.toLowerCase() === 'mei').length

  const operadores = ps.filter(p => p.role === 'operador')
  const ultimoDia  = new Date(ano, mes, 0).getDate()

  const alertas = OBRIGACOES_CAL.map(ob => {
    const diaNum = ob.dia === -1 ? ultimoDia : ob.dia
    const due  = new Date(ano, mes - 1, diaNum)
    const diff = Math.ceil((due.getTime() - hoje.getTime()) / 86400000)
    return { ...ob, diaNum, diff }
  }).filter(a => a.diff >= 0 && a.diff <= 10)

  const clientesObs = cs.filter(c => c.obs && c.obs.trim() !== '')
  const responsaveis = Array.from(
    new Set(cs.map(c => c.responsavel).filter(Boolean) as string[])
  ).sort()

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-white/40 mt-1">{MESES_PT[mes - 1]} {ano}</p>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-2">
            {alertas.map(a => {
              const lbl = alertaLabel(a.diff)
              return (
                <div key={a.nome} className={`rounded-full border px-3 py-1.5 flex items-center gap-2.5 ${alertaColor(a.diff)}`}>
                  <span className="text-white text-xs font-semibold">{a.nome}</span>
                  <span className="text-white/25 text-xs">·</span>
                  <span className={`text-xs font-bold ${lbl.cls}`}>{lbl.text}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Linha 1: Progresso Geral + Clientes */}
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Progresso Geral</p>
          <p className="text-3xl font-bold text-white">{pct}%</p>
          <div className="w-full h-2 bg-white/8 rounded-full mt-3 mb-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #00B8D4, #0066cc)' }} />
          </div>
          <p className="text-sm text-white/35">{concluidasTarefas}/{totalTarefas} tarefas concluídas</p>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Total de Clientes</p>
          <p className="text-3xl font-bold text-white">{cs.length}</p>
          <div className="flex gap-4 mt-3">
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide">Normal</p>
              <p className="text-sm font-semibold text-white/60">{normal}</p>
            </div>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide">Simples</p>
              <p className="text-sm font-semibold text-white/60">{simples}</p>
            </div>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide">MEI</p>
              <p className="text-sm font-semibold text-white/60">{mei}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Progresso por responsável — somente admin */}
      {responsaveis.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Progresso por Responsável</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {responsaveis.map(nome => {
              const perfil      = ps.find(p => p.nome?.toUpperCase() === nome.toUpperCase())
              const cor         = perfil?.cor || '#00B8D4'
              const opClientes  = cs.filter(c => c.responsavel?.toUpperCase() === nome.toUpperCase())
              const opTarefas   = ts.filter(t => opClientes.some(c => c.id === t.cliente_id))
              const opConcluidas = opTarefas.filter(t => t.concluida).length
              const opTotal     = opTarefas.length
              const opPct       = opTotal > 0 ? Math.round((opConcluidas / opTotal) * 100) : 0
              return (
                <div key={nome} className="rounded-2xl bg-white/2 border border-white/7 p-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: cor }}>
                      {nome.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm text-white/70 font-medium truncate">{nome}</p>
                  </div>
                  <p className="text-3xl font-bold text-white">{opPct}%</p>
                  <div className="w-full h-2 bg-white/8 rounded-full mt-3 mb-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${opPct}%`, backgroundColor: cor }} />
                  </div>
                  <p className="text-sm text-white/35">{opConcluidas}/{opTotal} · {opClientes.length} clientes</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Clientes com observações */}
      {clientesObs.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Clientes com Observações</h2>
          <div className="flex flex-col gap-2">
            {clientesObs.map(c => (
              <Link key={c.id} href={`/fiscal/clientes/${c.id}`}
                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/3 border border-white/8 hover:bg-white/6 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{c.nome}</p>
                  <p className="text-xs text-yellow-400/60 mt-0.5 truncate">{c.obs}</p>
                </div>
                <span className="text-white/20 text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
