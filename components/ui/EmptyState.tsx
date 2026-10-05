import type { ReactNode } from 'react'
import { cn } from './cn'

// Lista vazia que convida a agir (ds-06). `compacto` serve para listas dentro
// de cartões e janelas: menos respiro e ícone menor.
export function EmptyState({ icone, titulo, descricao, acao, compacto = false }: {
  icone: ReactNode
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
  compacto?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compacto ? 'gap-2 px-4 py-6' : 'gap-2.5 px-6 py-12')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center bg-acc-soft text-acc-text',
          compacto ? 'h-10 w-10 rounded-[11px]' : 'h-[52px] w-[52px] rounded-[14px]',
        )}
      >
        {icone}
      </span>
      <p className={cn('font-semibold text-fg', compacto ? 'text-sm' : 'text-[15px]')}>{titulo}</p>
      {descricao && <p className={cn('max-w-[420px] text-fg-3', compacto ? 'text-[13px]' : 'text-sm')}>{descricao}</p>}
      {acao && <div className={compacto ? 'mt-1' : 'mt-1.5'}>{acao}</div>}
    </div>
  )
}
