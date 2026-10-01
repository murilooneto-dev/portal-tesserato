import { cn } from './cn'

export type TomPercentual = 'vazio' | 'zero' | 'parcial' | 'completo'

// Corrige dado fora da faixa (0–100) e descarta NaN.
export function normalizarPercentual(p: number | null | undefined): number | null {
  if (p === null || p === undefined || Number.isNaN(p)) return null
  return Math.min(100, Math.max(0, Math.round(p)))
}

export function tomDoPercentual(p: number | null | undefined): TomPercentual {
  const n = normalizarPercentual(p)
  if (n === null) return 'vazio'
  if (n >= 100) return 'completo'
  if (n <= 0) return 'zero'
  return 'parcial'
}

const COR: Record<TomPercentual, string> = {
  vazio: 'text-fg-3 font-medium',
  zero: 'bg-danger-soft text-danger',
  parcial: 'bg-warn-soft text-warn',
  completo: 'bg-ok-soft text-ok',
}

export function MonthPill({ percentual, atual = false, rotulo, className }: {
  percentual: number | null | undefined
  atual?: boolean
  rotulo?: string
  className?: string
}) {
  const n = normalizarPercentual(percentual)
  const texto = n === null ? '—' : `${n}%`
  return (
    <span
      title={rotulo ?? (n === null ? 'Sem tarefas no mês' : `${n}% concluído`)}
      className={cn(
        'inline-flex h-[26px] min-w-10 items-center justify-center rounded-[7px] px-1 text-xs font-bold tabular-nums',
        COR[tomDoPercentual(percentual)],
        atual && 'ring-2 ring-acc',
        className,
      )}
    >
      {texto}
    </span>
  )
}
