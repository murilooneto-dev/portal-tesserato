'use client'

import type { Tarefa } from '@/lib/types'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR  = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MESES_ABR3 = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CORES_RESP = ['#ec4899','#3b82f6','#10b981','#eab308','#f97316','#8b5cf6','#06b6d4','#f43f5e']

interface MonthStat { total: number; concluidas: number; pct: number }

interface Props {
  clientes: ClienteComContabil[]
  tarefas: Tarefa[]
  isAdmin: boolean
  mes: number
  ano: number
}

export default function HistoricoContabil({ clientes, tarefas, isAdmin, mes, ano }: Props) {
  const [selectedResp, setSelectedResp] = useFiltroPersistente<string | null>('historico-contabil:responsavel', null)

  const responsaveis = Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean))) as string[]

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

  const filtroIds = selectedResp
    ? clientes.filter(c => c.responsavel === selectedResp).map(c => c.id)
    : todosIds
  const filtroStats = selectedResp ? calcStats(filtroIds) : globalStats

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">

      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Histórico Anual — {ano}</h1>
        <p className="text-sm text-[var(--fg)]/40 mt-1">Progresso de cada mês do ano</p>

        <div className="mt-5 rounded-2xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 px-6 pt-5 pb-4">
          <div className="flex items-end gap-0" style={{ height: '140px' }}>
            {globalStats.map((s, i) => {
              const m = i + 1
              const barH = s.total > 0 ? Math.max(8, Math.round((s.total / maxGlobal) * 100)) : 3
              const isCur = m === mes
              return (
                <div key={m} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[10px] text-[var(--fg)]/40 h-4 leading-4">
                    {s.pct > 0 ? `${s.pct}%` : ''}
                  </span>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${barH}px`,
                        backgroundColor: isCur ? 'var(--accent)' : s.total > 0 ? '#3b82f6' : 'color-mix(in srgb, var(--fg) 12%, transparent)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--fg)]/35 h-4 leading-4">{MESES_ABR3[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {isAdmin && responsaveis.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">Progresso por responsável</h2>
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
                    borderColor: isSel ? cor : 'color-mix(in srgb, var(--fg) 8%, transparent)',
                    backgroundColor: isSel ? `${cor}12` : 'color-mix(in srgb, var(--fg) 2%, transparent)',
                  }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
                      <span className="text-[var(--fg)] text-sm font-semibold">{resp}</span>
                    </div>
                    {isSel && (
                      <span className="text-[10px] font-bold" style={{ color: cor }}>Selecionado</span>
                    )}
                  </div>

                  <div className="flex items-end gap-px" style={{ height: '48px' }}>
                    {stats.map((s, i) => {
                      const h = s.total > 0 ? Math.max(4, Math.round((s.total / maxR) * 40)) : 0
                      const isCur = i + 1 === mes
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px">
                          {s.total > 0 ? (
                            <div className="w-full rounded-sm"
                              style={{ height: `${h}px`, backgroundColor: isCur ? cor : `${cor}60` }} />
                          ) : (
                            <div className="w-full border-b border-dashed border-[var(--fg)]/15" style={{ height: '1px', marginBottom: '4px' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex mt-1">
                    {MESES_ABR.map((a, i) => (
                      <div key={i} className="flex-1 text-center text-[9px] text-[var(--fg)]/25">{a}</div>
                    ))}
                  </div>

                  <div className="flex mt-0.5">
                    {Array.from({ length: 12 }, (_, i) => (
                      <div key={i} className="flex-1 text-center text-[9px]">
                        {i + 1 === mes
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

      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest">Selecionar mês para detalhar</h2>
            {selectedResp && (
              <p className="text-xs mt-0.5" style={{ color: CORES_RESP[responsaveis.indexOf(selectedResp) % CORES_RESP.length] }}>
                Responsável: {selectedResp}
              </p>
            )}
          </div>
          {selectedResp && (
            <button
              onClick={() => setSelectedResp(null)}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] px-4 py-2 rounded-xl transition-all">
              Ver todos
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {MESES_NOME.map((nome, i) => {
            const s = filtroStats[i]
            const isCur = i + 1 === mes
            const respIdx = selectedResp ? responsaveis.indexOf(selectedResp) : -1
            const cor = respIdx >= 0 ? CORES_RESP[respIdx % CORES_RESP.length] : 'var(--accent)'

            const pctColor = s.pct === 100 ? '#10b981' : s.pct > 0 ? '#f59e0b' : 'color-mix(in srgb, var(--fg) 25%, transparent)'

            return (
              <div key={nome}
                className="rounded-xl border p-4 transition-all"
                style={{
                  borderColor: isCur ? cor : 'color-mix(in srgb, var(--fg) 8%, transparent)',
                  backgroundColor: isCur ? `${cor}25` : 'color-mix(in srgb, var(--fg) 2%, transparent)',
                }}>
                <p className="text-sm font-semibold" style={{ color: isCur ? 'var(--fg)' : 'color-mix(in srgb, var(--fg) 70%, transparent)' }}>{nome}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: isCur ? 'var(--fg)' : pctColor }}>
                  {s.pct}%
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
