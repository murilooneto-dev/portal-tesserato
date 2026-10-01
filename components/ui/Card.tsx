import type { ReactNode } from 'react'
import { cn } from './cn'

export function Card({ titulo, meta, acoes, semPadding = false, className, children }: {
  titulo?: ReactNode
  meta?: ReactNode
  acoes?: ReactNode
  semPadding?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-line-soft bg-surface', className)}>
      {(titulo || acoes) && (
        <div className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
          {titulo && <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>}
          {meta}
          {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
        </div>
      )}
      {semPadding ? children : <div className="px-[18px] py-4">{children}</div>}
    </section>
  )
}
