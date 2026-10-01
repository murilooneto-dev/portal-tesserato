import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from './cn'

type Alinhar = 'esq' | 'centro' | 'dir'
const ALINHAR: Record<Alinhar, string> = { esq: 'text-left', centro: 'text-center', dir: 'text-right' }

export function Tabela({ className, children }: { className?: string; children: ReactNode }) {
  return <table className={cn('w-full table-fixed border-collapse text-sm', className)}>{children}</table>
}

export function Th({ alinhar = 'esq', largura, className, style, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & {
  alinhar?: Alinhar
  largura?: number
}) {
  return (
    <th
      style={largura ? { width: `${largura}px`, ...style } : style}
      className={cn(
        'whitespace-nowrap border-b border-line-soft bg-[color-mix(in_srgb,var(--fg)_2%,transparent)] px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[.04em] text-fg-3',
        ALINHAR[alinhar],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ alinhar = 'esq', className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { alinhar?: Alinhar }) {
  return (
    <td className={cn('border-b border-line-soft px-3.5 py-3 align-middle', ALINHAR[alinhar], className)} {...rest}>
      {children}
    </td>
  )
}
