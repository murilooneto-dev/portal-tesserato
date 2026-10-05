'use client'

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

const CAMPO =
  'w-full rounded-lg border border-line bg-inset px-3 text-sm text-fg placeholder:text-ph ' +
  'focus:border-acc focus:outline-none focus:ring-[3px] focus:ring-acc-soft disabled:cursor-not-allowed disabled:opacity-60'
const INVALIDO = 'border-danger ring-[3px] ring-danger-soft'

export function Input({ invalido = false, iconeEsquerda, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & {
  invalido?: boolean
  iconeEsquerda?: ReactNode
}) {
  const input = (
    <input
      aria-invalid={invalido || undefined}
      className={cn(CAMPO, 'h-9 max-sm:h-11', iconeEsquerda ? 'pl-9' : undefined, invalido && INVALIDO, className)}
      {...rest}
    />
  )
  if (!iconeEsquerda) return input
  return (
    <div className="relative min-w-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true">{iconeEsquerda}</span>
      {input}
    </div>
  )
}

export function Select({ invalido = false, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & {
  invalido?: boolean
}) {
  return (
    <div className="relative min-w-0">
      <select
        aria-invalid={invalido || undefined}
        className={cn(CAMPO, 'h-9 appearance-none pr-9 max-sm:h-11', invalido && INVALIDO, className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  )
}

export function Textarea({ invalido = false, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalido?: boolean
}) {
  return (
    <textarea
      aria-invalid={invalido || undefined}
      className={cn(CAMPO, 'min-h-[88px] py-2 leading-relaxed max-sm:min-h-11', invalido && INVALIDO, className)}
      {...rest}
    />
  )
}

export function Checkbox({ rotulo, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  rotulo: ReactNode
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-fg-2', className)}>
      <input type="checkbox" className="h-[18px] w-[18px] flex-none cursor-pointer accent-[var(--acc)]" {...rest} />
      <span>{rotulo}</span>
    </label>
  )
}

export function Switch({ ligado, onMudar, rotulo, disabled = false }: {
  ligado: boolean
  onMudar: (ligado: boolean) => void
  rotulo: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onMudar(!ligado)}
      className="inline-flex items-center gap-2.5 text-sm text-fg-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 flex-none rounded-full border transition-colors',
          ligado ? 'border-acc bg-acc' : 'border-line bg-raised',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all',
            ligado ? 'left-[18px] bg-acc-ink' : 'left-[2px] bg-fg-3',
          )}
        />
      </span>
      {rotulo}
    </button>
  )
}
