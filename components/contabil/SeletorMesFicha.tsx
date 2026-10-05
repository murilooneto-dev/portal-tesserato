'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { MESES, mesVizinho, rotuloMes } from '@/lib/mes-navegacao'
import { COR, tomDoPercentual, normalizarPercentual } from '@/components/ui/MonthPill'
import { cn } from '@/components/ui/cn'

// Seletor de mês da ficha: ‹ [Setembro 2026 ▾] ›. Só troca o mês que a ficha
// mostra (?mes=&ano=), sem mudar o mês de trabalho do portal.
export default function SeletorMesFicha({ mes, ano, basePath, progresso }: {
  mes: number
  ano: number
  basePath: string
  progresso: Record<number, number | null>
}) {
  const [aberto, setAberto] = useState(false)
  const anterior = mesVizinho(mes, ano, -1)
  const proximo = mesVizinho(mes, ano, 1)
  const hrefDo = (m: number, a: number) => `${basePath}?mes=${m}&ano=${a}`
  const rotulo = rotuloMes(mes, ano)

  return (
    <div role="group" aria-label="Mês das tarefas" className="relative flex items-center gap-1.5">
      <h3 className="sr-only">Tarefas de {rotulo}</h3>
      <Link
        href={hrefDo(anterior.mes, anterior.ano)}
        aria-label="Mês anterior"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--fg)]/10 text-[var(--fg)]/60 hover:text-[var(--fg)] hover:border-[var(--fg)]/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <button
        type="button"
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
        className="inline-flex h-9 min-w-[190px] items-center justify-between gap-2 rounded-lg border border-[var(--fg)]/10 bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--fg)] hover:border-[var(--fg)]/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        <span>{MESES[mes - 1]} {ano}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn('transition-transform', aberto && 'rotate-180')} />
      </button>
      <Link
        href={hrefDo(proximo.mes, proximo.ano)}
        aria-label="Próximo mês"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--fg)]/10 text-[var(--fg)]/60 hover:text-[var(--fg)] hover:border-[var(--fg)]/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Link>

      {aberto && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[min(360px,calc(100vw-32px))] rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-[var(--fg)]/50">Andamento de {ano}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((nome, i) => {
              const mesNum = i + 1
              const pct = normalizarPercentual(progresso[mesNum] ?? null)
              const atual = mesNum === mes
              return (
                <Link
                  key={nome}
                  href={hrefDo(mesNum, ano)}
                  aria-current={atual ? 'date' : undefined}
                  onClick={() => setAberto(false)}
                  className={cn(
                    'flex flex-col items-start rounded-lg px-2.5 py-2 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                    COR[tomDoPercentual(pct)],
                  )}
                  style={atual ? { boxShadow: 'inset 0 0 0 2px var(--acc)' } : undefined}
                >
                  <span className="text-xs font-semibold leading-none">{nome.slice(0, 3)}</span>
                  <span className="mt-1 text-sm font-bold tabular-nums leading-none">{pct === null ? '—' : `${pct}%`}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
