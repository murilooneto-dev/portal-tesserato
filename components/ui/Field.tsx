'use client'

import { useId, type ReactNode } from 'react'
import { cn } from './cn'

export interface CampoIds {
  id: string
  describedBy?: string
  invalido: boolean
}

export function Field({ rotulo, ajuda, erro, obrigatorio = false, className, children }: {
  rotulo: ReactNode
  ajuda?: ReactNode
  erro?: string | null
  obrigatorio?: boolean
  className?: string
  children: (c: CampoIds) => ReactNode
}) {
  const id = useId()
  const idAjuda = ajuda && !erro ? `${id}-ajuda` : undefined
  const idErro = erro ? `${id}-erro` : undefined
  const describedBy = [idErro, idAjuda].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-fg-2">
        {rotulo}
        {obrigatorio && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </label>
      {children({ id, describedBy, invalido: Boolean(erro) })}
      {erro && <p id={idErro} role="alert" className="text-xs text-danger">{erro}</p>}
      {ajuda && !erro && <p id={idAjuda} className="text-xs text-fg-3">{ajuda}</p>}
    </div>
  )
}
