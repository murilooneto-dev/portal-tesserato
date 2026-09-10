'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'

interface ClienteResumo {
  id: string
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
}

interface Props {
  clientes: ClienteResumo[]
  tiposPorCliente: Record<string, string[]>
  concluidasPorCliente: Record<string, string[]>
  tarefasDisponiveis: string[]
  mes: number
  ano: number
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const TODAS_TAREFAS = 'TODAS'

export default function ClientesListaSocietario({ clientes, tiposPorCliente, concluidasPorCliente, tarefasDisponiveis, mes, ano, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-societario:busca', '')
  const [filtroTarefa, setFiltroTarefa] = useFiltroPersistente('clientes-societario:tarefa', TODAS_TAREFAS)
  const [apenasPendentes, setApenasPendentes] = useFiltroPersistente('clientes-societario:apenasPendentes', false)

  const selectClass = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (filtroTarefa !== TODAS_TAREFAS && !tiposPorCliente[c.id]?.includes(filtroTarefa)) return false
    if (apenasPendentes) {
      if (filtroTarefa !== TODAS_TAREFAS) {
        if (concluidasPorCliente[c.id]?.includes(filtroTarefa)) return false
      } else {
        const total = tiposPorCliente[c.id]?.length ?? 0
        const concluidas = concluidasPorCliente[c.id]?.length ?? 0
        if (total === 0 || concluidas >= total) return false
      }
    }
    return true
  }), [clientes, busca, filtroTarefa, apenasPendentes, tiposPorCliente, concluidasPorCliente])

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
        <select value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)} className={selectClass}>
          <option value={TODAS_TAREFAS} className="bg-[var(--bg-surface)]">Todas as tarefas</option>
          {tarefasDisponiveis.map(t => <option key={t} value={t} className="bg-[var(--bg-surface)]">{t}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer select-none hover:border-[var(--fg)]/20 transition-colors">
          <input
            type="checkbox"
            checked={apenasPendentes}
            onChange={e => setApenasPendentes(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Apenas pendentes</span>
        </label>
      </div>

      <p className="text-[var(--fg)]/30 text-xs mb-3">
        {filtrados.length} clientes · {MESES[mes - 1]}/{ano}
      </p>

      <div className="flex flex-col gap-1.5">
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}

        {filtrados.map(cliente => {
          const total = tiposPorCliente[cliente.id]?.length ?? 0
          const concluidas = concluidasPorCliente[cliente.id]?.length ?? 0
          const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0

          return (
            <Link
              key={cliente.id}
              href={`/societario/clientes/${cliente.id}`}
              className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 hover:border-[var(--fg)]/15 transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.nome}
                  {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => {
                    const badge = formatarBadgeVinculo(p)
                    return (
                      <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.classe}`}>
                        {badge.texto}
                      </span>
                    )
                  })}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">
                  {cliente.cnpj ?? '—'}
                  {cliente.municipio && ` · ${cliente.municipio}${cliente.uf ? `/${cliente.uf}` : ''}`}
                </p>
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
            </Link>
          )
        })}
      </div>
    </div>
  )
}
