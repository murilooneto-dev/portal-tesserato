import type { PropsWithChildren, ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTom = 'ok' | 'warn' | 'dng' | 'info' | 'acc' | 'neu'

const TOM: Record<BadgeTom, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  dng: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  acc: 'bg-acc-soft text-acc-text',
  neu: 'bg-neutral-soft text-fg-2',
}

interface BadgeProps {
  tom?: BadgeTom
  icone?: ReactNode
  grande?: boolean
  className?: string
}

export function Badge({ tom = 'neu', icone, grande = false, className, children }: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-md font-semibold leading-none',
        grande ? 'h-[26px] px-2.5 text-[13px]' : 'h-[22px] px-2 text-xs',
        TOM[tom],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  )
}
