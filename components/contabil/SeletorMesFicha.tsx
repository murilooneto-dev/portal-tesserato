'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { MESES, mesVizinho, rotuloMes } from '@/lib/mes-navegacao'
import { COR, tomDoPercentual, normalizarPercentual } from '@/components/ui/MonthPill'
import { cn } from '@/components/ui/cn'

// Seletor de mês da ficha: ‹ [Setembro 2026 ▾] ›. Só troca o mês que a ficha
// mostra (?mes=&ano=), sem mudar o mês de trabalho do portal. Sem troca de ano.

// Setas com o desenho do IconButton com borda (44px no celular); continuam
// links, porque trocar de mês é navegação.
const SETA = 'inline-grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc max-sm:h-11 max-sm:w-11'
// Largura do quadro dos meses (a mesma da classe w-[min(520px,calc(100vw-32px))]).
const largura = () => Math.min(520, window.innerWidth - 32)

export default function SeletorMesFicha({ mes, ano, basePath, progresso }: {
  mes: number
  ano: number
  basePath: string
  progresso: Record<number, number | null>
}) {
  const [aberto, setAberto] = useState(false)
  // Deslocamento do quadro em relação ao seletor (0 = alinhado à esquerda).
  const [deslocamento, setDeslocamento] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  // Fecha com clique (ou toque) fora do seletor.
  useEffect(() => {
    if (!aberto) return
    function fora(e: PointerEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  function alternar() {
    if (!aberto && caixaRef.current) {
      // Quando o quadro não cabe para a direita, ele é puxado para a esquerda
      // até caber, sem passar da margem de 16px de nenhum dos lados.
      const { left } = caixaRef.current.getBoundingClientRect()
      const falta = Math.min(0, window.innerWidth - 16 - largura() - left)
      setDeslocamento(Math.max(falta, 16 - left))
    }
    setAberto(v => !v)
  }
  const anterior = mesVizinho(mes, ano, -1)
  const proximo = mesVizinho(mes, ano, 1)
  const hrefDo = (m: number, a: number) => `${basePath}?mes=${m}&ano=${a}`
  const rotulo = rotuloMes(mes, ano)

  return (
    <div
      ref={caixaRef}
      role="group"
      aria-label="Mês das tarefas"
      className="relative flex items-center gap-1.5"
      // Esc de qualquer lugar do seletor (botão ou quadro) fecha e devolve o foco ao botão.
      onKeyDown={e => { if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false); botaoRef.current?.focus() } }}
    >
      <h3 className="sr-only">Tarefas de {rotulo}</h3>
      <Link
        href={hrefDo(anterior.mes, anterior.ano)}
        aria-label="Mês anterior"
        className={SETA}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <button
        type="button"
        aria-expanded={aberto}
        aria-haspopup="true"
        ref={botaoRef}
        onClick={alternar}
        className="inline-flex h-9 min-w-[190px] max-sm:h-11 items-center justify-between gap-2 rounded-lg border border-acc bg-acc-soft px-3 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        <span>{MESES[mes - 1]} {ano}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn('transition-transform', aberto && 'rotate-180')} />
      </button>
      <Link
        href={hrefDo(proximo.mes, proximo.ano)}
        aria-label="Próximo mês"
        className={SETA}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Link>

      {aberto && (
        <div role="group" aria-label={`Andamento de ${ano}`} className="absolute top-full z-20 mt-2 w-[min(520px,calc(100vw-32px))] rounded-xl border border-line bg-raised p-3.5 shadow-lg" style={{ left: deslocamento }}>
          <p className="mb-2.5 text-center text-sm font-bold text-fg">{ano}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                    'flex items-center gap-2 rounded-[9px] border px-2.5 py-2 text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                    atual ? 'border-acc bg-acc-soft font-bold' : 'border-line-soft bg-surface font-medium hover:bg-raised',
                  )}
                >
                  <span className="flex-1 text-sm">{nome.slice(0, 3)}</span>
                  <span
                    title={pct === null ? 'Sem tarefas no mês' : `${pct}% concluído`}
                    className={cn('inline-flex h-6 min-w-10 items-center justify-center rounded-[7px] px-1 text-xs font-bold tabular-nums', COR[tomDoPercentual(pct)])}
                  >
                    {pct === null ? '—' : `${pct}%`}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
