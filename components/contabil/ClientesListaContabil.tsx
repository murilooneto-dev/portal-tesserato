'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import EmpresaContabilModal from './EmpresaContabilModal'
import { REGIMES, labelRegime } from '@/lib/atividades-regimes'

const CORES_RESP: string[] = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316','#ef4444','#84cc16']
const _respColorCache: Record<string, string> = {}
function corResponsavel(nome: string): string {
  if (!_respColorCache[nome]) {
    _respColorCache[nome] = CORES_RESP[Object.keys(_respColorCache).length % CORES_RESP.length]
  }
  return _respColorCache[nome]
}

const CORES_REGIME: Record<string, string> = {
  normal:  '#3b82f6',
  simples: '#10b981',
  mei:     '#f59e0b',
}


interface Props {
  clientes: ClienteComContabil[]
  progressoAnualMap: Record<string, { total: number; concluidasPorMes: Record<number, number> }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function corPct(pct: number): { bg: string; fg: string } {
  if (pct === 100) return { bg: '#10b98120', fg: '#10b981' }
  if (pct > 0) return { bg: '#f59e0b20', fg: '#f59e0b' }
  return { bg: '#ef444415', fg: '#ef4444' }
}

export default function ClientesListaContabil({ clientes, progressoAnualMap, mes, ano, tarefasPadrao, catalogo, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-contabil:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-contabil:responsavel', 'TODOS')
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-contabil:regime', 'TODOS')
  const [filtroPrioridade, setFiltroPrioridade] = useFiltroPersistente('clientes-contabil:prioridade', 'TODOS')
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-contabil:mostrarDesabilitados', false)
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const prioridades = useMemo(() => Array.from(new Set(
    clientes.map(c => c.prioridade).filter((p): p is number => !!p && p > 0)
  )).sort((a, b) => a - b), [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    if (filtroRegime !== 'TODOS' && c.regime !== filtroRegime) return false
    if (filtroPrioridade !== 'TODOS' && String(c.prioridade ?? '') !== filtroPrioridade) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroRegime, filtroPrioridade, mostrarDesabilitados])

  const selectClass = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Buscar cliente ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
        <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} className={selectClass}>
          {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
        <select value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todos os regimes</option>
          {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
        <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todas as prioridades</option>
          {prioridades.map(p => <option key={p} value={p} className="bg-[var(--bg-surface)]">{`P${p}`}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer select-none hover:border-[var(--fg)]/20 transition-colors">
          <input
            type="checkbox"
            checked={mostrarDesabilitados}
            onChange={e => setMostrarDesabilitados(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Mostrar desabilitados</span>
        </label>
        <button
          onClick={() => setModalNovoOpen(true)}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
          + Novo Cliente
        </button>
      </div>

      {modalNovoOpen && (
        <EmpresaContabilModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      <p className="text-[var(--fg)]/30 text-xs mb-3">
        {filtrados.length} clientes · {ano}
      </p>

      {filtrados.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--fg)]/5 text-[var(--fg)]/40 text-xs uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-[var(--bg)] z-10">Cliente</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Regime</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Responsável</th>
                {MESES.map((m, i) => (
                  <th key={m} className={`px-1 py-2.5 text-center font-semibold whitespace-nowrap ${i + 1 === mes ? 'text-[var(--accent)]' : ''}`}>
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(cliente => {
                const prog = progressoAnualMap[cliente.id]
                const total = prog?.total ?? 0
                const temObs = !!(cliente.obs?.trim())

                return (
                  <tr key={cliente.id} className="border-t border-[var(--fg)]/6 hover:bg-[var(--fg)]/3 transition-colors group">
                    <td className="px-3 py-2.5 sticky left-0 bg-[var(--bg)] group-hover:bg-[var(--fg)]/3">
                      <Link href={`/contabil/clientes/${cliente.id}`} className="flex items-start gap-2 min-w-[170px] max-w-[260px]">
                        {cliente.prioridade && cliente.prioridade > 0 ? (
                          <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400">P{cliente.prioridade}</span>
                        ) : null}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[var(--fg)] font-semibold truncate hover:underline">{cliente.nome}</span>
                            {temObs && <span className="shrink-0 text-amber-400 font-bold">!</span>}
                            {cliente.ativo === false && (
                              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15">
                                Desabilitado
                              </span>
                            )}
                          </span>
                          <span className="block text-[var(--fg)]/25 text-xs">{cliente.cnpj ?? '—'}</span>
                          {(pendenciasVinculo[cliente.id] ?? []).length > 0 && (
                            <span className="flex flex-wrap gap-1 mt-1">
                              {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => {
                                const badge = formatarBadgeVinculo(p)
                                return (
                                  <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.classe}`}>
                                    {badge.texto}
                                  </span>
                                )
                              })}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {cliente.regime && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: (CORES_REGIME[cliente.regime] ?? '#6b7280') + '25', color: CORES_REGIME[cliente.regime] ?? '#6b7280', border: `1px solid ${CORES_REGIME[cliente.regime] ?? '#6b7280'}50` }}>
                          {labelRegime(cliente.regime)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {cliente.responsavel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: corResponsavel(cliente.responsavel) + '25', color: corResponsavel(cliente.responsavel), border: `1px solid ${corResponsavel(cliente.responsavel)}50` }}>
                          {cliente.responsavel}
                        </span>
                      )}
                    </td>
                    {MESES.map((_, i) => {
                      const mesNum = i + 1
                      const concluidas = prog?.concluidasPorMes[mesNum] ?? 0
                      const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
                      const cor = corPct(pct)
                      const destacado = mesNum === mes

                      return (
                        <td key={mesNum} className={`px-0.5 py-1.5 text-center ${destacado ? 'bg-[var(--accent)]/5' : ''}`}>
                          {total > 0 ? (
                            <Link
                              href={`/contabil/clientes/${cliente.id}?mes=${mesNum}&ano=${ano}`}
                              className="inline-flex flex-col items-center justify-center min-w-[38px] px-1 py-1 rounded-lg font-bold text-[11px] transition-transform hover:scale-105"
                              style={{ backgroundColor: cor.bg, color: cor.fg }}
                              title={`${concluidas}/${total} concluídas`}
                            >
                              {pct}%
                            </Link>
                          ) : (
                            <span className="inline-block min-w-[38px] px-1 py-1 text-[var(--fg)]/15 text-[11px]">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
