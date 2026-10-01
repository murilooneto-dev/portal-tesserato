import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from './cn'

export type AvisoTom = 'info' | 'warn' | 'dng' | 'ok'

const FUNDO: Record<AvisoTom, string> = { info: 'bg-info-soft', warn: 'bg-warn-soft', dng: 'bg-danger-soft', ok: 'bg-ok-soft' }
const COR_ICONE: Record<AvisoTom, string> = { info: 'text-info', warn: 'text-warn', dng: 'text-danger', ok: 'text-ok' }
const ICONE: Record<AvisoTom, typeof Info> = { info: Info, warn: AlertTriangle, dng: AlertCircle, ok: CheckCircle2 }

export function Aviso({ tom, icone, className, children }: {
  tom: AvisoTom
  icone?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const Icone = ICONE[tom]
  return (
    <div className={cn('flex items-start gap-3 rounded-[10px] px-4 py-3 text-[13px] leading-relaxed text-fg-2 [&_b]:font-semibold [&_b]:text-fg', FUNDO[tom], className)}>
      <span aria-hidden="true" className={cn('mt-0.5 flex-none', COR_ICONE[tom])}>{icone ?? <Icone size={18} />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
