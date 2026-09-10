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
  progressoMap: Record<string, { total: number; concluidas: number }>
  comPendencia: Set<string>
  mes: number
  ano: number
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesListaSocietario({ clientes, progressoMap, comPendencia, mes, ano, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-societario:busca', '')
  const [apenasPendentes, setApenasPendentes] = useFiltroPersistente('clientes-societario:apenasPendentes', false)

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (apenasPendentes && !comPendencia.has(c.id)) return false
    return true
  }), [clientes, busca, apenasPendentes, comPendencia])

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
          const prog = progressoMap[cliente.id]
          const total = prog?.total ?? 0
          const concluidas = prog?.concluidas ?? 0
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
