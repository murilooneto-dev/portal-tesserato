'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, Tarefa } from '@/lib/types'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR  = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MESES_ABR3 = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANO_ATUAL  = new Date().getFullYear()
const MES_ATUAL  = new Date().getMonth() + 1

const CORES_RESP = ['#ec4899','#3b82f6','#10b981','#eab308','#f97316','#8b5cf6','#06b6d4','#f43f5e']


interface MonthStat { total: number; concluidas: number; pct: number }

export default function HistoricoPage() {
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [selectedResp, setSelectedResp] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [isAdmin, setIsAdmin]       = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        setIsAdmin(admin)

        let clientesQ = sb.from('clientes').select('*').order('nome')
        if (!admin && p?.nome) clientesQ = (clientesQ as any).ilike('responsavel', p.nome)

        clientesQ.then(async ({ data: cs }) => {
          const ids = (cs ?? []).map((c: any) => c.id)
          let ts: any[] = []
          if (ids.length > 0) {
            const { data } = await sb
              .from('tarefas')
              .select('*')
              .eq('ano', ANO_ATUAL)
              .in('cliente_id', ids)
              .limit(10000)
            ts = data ?? []
          }
          setClientes((cs ?? []) as Cliente[])
          setTarefas(ts as Tarefa[])
          setLoading(false)
        })
      })
    })
  }, [])

  const responsaveis = Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean))) as string[]

  // Mesmo cálculo usado em Dashboard/Clientes/Relatórios:
  // total = número de tipos esperados pelo grupo (não linhas no banco)
  function calcStats(clienteIds: string[]): MonthStat[] {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const mTarefas = tarefas.filter(t => t.mes === m && clienteIds.includes(t.cliente_id))
      const total = mTarefas.length
      const concluidas = mTarefas.filter(t => t.concluida).length
      const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
      return { total, concluidas, pct }
    })
  }

  const todosIds  = clientes.map(c => c.id)
  const globalStats = calcStats(todosIds)
  const maxGlobal = Math.max(...globalStats.map(s => s.total), 1)

  // Stats filtradas pelo responsável selecionado (ou todos)
  const filtroIds = selectedResp
    ? clientes.filter(c => c.responsavel === selectedResp).map(c => c.id)
    : todosIds
  const filtroStats = selectedResp ? calcStats(filtroIds) : globalStats

  if (loading) return <div className="p-8 text-white/30 text-sm">Carregando...</div>

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">

      {/* Título + gráfico global */}
      <div>
        <h1 className="text-2xl font-bold text-white">Histórico Anual — {ANO_ATUAL}</h1>
        <p className="text-sm text-white/40 mt-1">Progresso de cada mês do ano</p>

        <div className="mt-5 rounded-2xl border border-white/8 bg-white/2 px-6 pt-5 pb-4">
          <div className="flex items-end gap-0" style={{ height: '140px' }}>
            {globalStats.map((s, i) => {
              const m = i + 1
              const barH = s.total > 0 ? Math.max(8, Math.round((s.total / maxGlobal) * 100)) : 3
              const isCur = m === MES_ATUAL
              return (
                <div key={m} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[10px] text-white/40 h-4 leading-4">
                    {s.pct > 0 ? `${s.pct}%` : ''}
                  </span>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${barH}px`,
                        backgroundColor: isCur ? '#00B8D4' : s.total > 0 ? '#3b82f6' : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-white/35 h-4 leading-4">{MESES_ABR3[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cards dos responsáveis — somente admin */}
      {isAdmin && responsaveis.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Progresso por responsável</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {responsaveis.map((resp, ri) => {
              const cor = CORES_RESP[ri % CORES_RESP.length]
              const stats = calcStats(clientes.filter(c => c.responsavel === resp).map(c => c.id))
              const maxR  = Math.max(...stats.map(s => s.total), 1)
              const isSel = selectedResp === resp
              return (
                <div key={resp}
                  onClick={() => setSelectedResp(isSel ? null : resp)}
                  className="rounded-2xl border p-4 cursor-pointer transition-all select-none"
                  style={{
                    borderColor: isSel ? cor : 'rgba(255,255,255,0.08)',
                    backgroundColor: isSel ? `${cor}12` : 'rgba(255,255,255,0.02)',
                  }}>
                  {/* Header do card */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
                      <span className="text-white text-sm font-semibold">{resp}</span>
                    </div>
                    {isSel && (
                      <span className="text-[10px] font-bold" style={{ color: cor }}>Selecionado</span>
                    )}
                  </div>

                  {/* Mini bar chart */}
                  <div className="flex items-end gap-px" style={{ height: '48px' }}>
                    {stats.map((s, i) => {
                      const h = s.total > 0 ? Math.max(4, Math.round((s.total / maxR) * 40)) : 0
                      const isCur = i + 1 === MES_ATUAL
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px">
                          {s.total > 0 ? (
                            <div className="w-full rounded-sm"
                              style={{ height: `${h}px`, backgroundColor: isCur ? cor : `${cor}60` }} />
                          ) : (
                            <div className="w-full border-b border-dashed border-white/15" style={{ height: '1px', marginBottom: '4px' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Labels J F M A M J J A S O N D */}
                  <div className="flex mt-1">
                    {MESES_ABR.map((a, i) => (
                      <div key={i} className="flex-1 text-center text-[9px] text-white/25">{a}</div>
                    ))}
                  </div>

                  {/* Mês atual label */}
                  <div className="flex mt-0.5">
                    {Array.from({ length: 12 }, (_, i) => (
                      <div key={i} className="flex-1 text-center text-[9px]">
                        {i + 1 === MES_ATUAL
                          ? <span style={{ color: cor }}>{MESES_ABR[i]}</span>
                          : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Grid de meses */}
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Selecionar mês para detalhar</h2>
            {selectedResp && (
              <p className="text-xs mt-0.5" style={{ color: CORES_RESP[responsaveis.indexOf(selectedResp) % CORES_RESP.length] }}>
                Responsável: {selectedResp}
              </p>
            )}
          </div>
          {selectedResp && (
            <button
              onClick={() => setSelectedResp(null)}
              className="text-xs bg-white/8 border border-white/12 text-white/60 hover:text-white px-4 py-2 rounded-xl transition-all">
              Ver todos
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {MESES_NOME.map((nome, i) => {
            const s = filtroStats[i]
            const isCur = i + 1 === MES_ATUAL
            const respIdx = selectedResp ? responsaveis.indexOf(selectedResp) : -1
            const cor = respIdx >= 0 ? CORES_RESP[respIdx % CORES_RESP.length] : '#00B8D4'

            const pctColor = s.pct === 100 ? '#10b981' : s.pct > 0 ? '#f59e0b' : 'rgba(255,255,255,0.25)'

            return (
              <div key={nome}
                className="rounded-xl border p-4 transition-all"
                style={{
                  borderColor: isCur ? cor : 'rgba(255,255,255,0.08)',
                  backgroundColor: isCur ? `${cor}25` : 'rgba(255,255,255,0.02)',
                }}>
                <p className="text-sm font-semibold" style={{ color: isCur ? '#fff' : 'rgba(255,255,255,0.7)' }}>{nome}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: isCur ? '#fff' : pctColor }}>
                  {s.pct}%
                </p>
                <p className="text-xs mt-0.5" style={{ color: isCur ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>
                  {s.concluidas}/{s.total} tarefas
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
