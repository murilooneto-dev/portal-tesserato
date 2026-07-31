'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { PendenciaVinculo } from '@/lib/vinculos'
import EmpresaContabilModal from './EmpresaContabilModal'

const CORES_RESP: string[] = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316','#ef4444','#84cc16']
const _respColorCache: Record<string, string> = {}
function corResponsavel(nome: string): string {
  if (!_respColorCache[nome]) {
    _respColorCache[nome] = CORES_RESP[Object.keys(_respColorCache).length % CORES_RESP.length]
  }
  return _respColorCache[nome]
}

interface Props {
  clientes: ClienteComContabil[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesListaContabil({ clientes, progressoMap, mes, ano, tarefasPadrao, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-contabil:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-contabil:responsavel', 'TODOS')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    return true
  }), [clientes, busca, filtroResponsavel])

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
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      <p className="text-[var(--fg)]/30 text-xs mb-3">
        {filtrados.length} clientes · {MESES[mes - 1]}/{ano}
      </p>

      <div className="flex flex-col gap-1.5">
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}

        {filtrados.map(cliente => {
          const prog = progressoMap[cliente.id]
          const total = prog?.total ?? 0
          const concluidas = prog?.concluidas ?? 0
          const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
          const temObs = !!(cliente.obs?.trim())

          return (
            <Link
              key={cliente.id}
              href={`/contabil/clientes/${cliente.id}`}
              className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 hover:border-[var(--fg)]/15 transition-all group"
            >
              {cliente.prioridade && cliente.prioridade > 0 ? (
                <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <span className="text-red-400 text-[10px] font-bold">P{cliente.prioridade}</span>
                </div>
              ) : (
                <div className="w-7 h-7 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.nome}
                  {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
                    <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      p.liberada ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {p.liberada ? `✓ Liberada por ${p.setorOrigemLabel}` : `⏳ Aguardando ${p.setorOrigemLabel}`}
                    </span>
                  ))}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {cliente.atividade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {cliente.atividade}
                  </span>
                )}
                {cliente.responsavel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: corResponsavel(cliente.responsavel) + '25', color: corResponsavel(cliente.responsavel), border: `1px solid ${corResponsavel(cliente.responsavel)}50` }}>
                    {cliente.responsavel}
                  </span>
                )}
              </div>

              {total > 0 && (
                <div className="w-20 shrink-0 text-right">
                  <p className={`text-sm font-bold ${pct === 100 ? 'text-[#10b981]' : 'text-[var(--fg)]'}`}>{pct}%</p>
                  <div className="w-full h-1 bg-[var(--fg)]/10 rounded-full mt-1">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : 'var(--accent)' }} />
                  </div>
                  <p className="text-[var(--fg)]/25 text-[10px] mt-0.5">{concluidas}/{total}</p>
                </div>
              )}

              <div className="w-4 shrink-0 text-center">
                {temObs && <span className="text-amber-400 text-sm font-bold">!</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
