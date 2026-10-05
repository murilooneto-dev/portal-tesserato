import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'perigo-solido'
export type ButtonSize = 'p' | 'm' | 'g'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-page ' +
  'disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTE: Record<ButtonVariant, string> = {
  primario: 'bg-acc border-acc text-acc-ink font-semibold hover:brightness-95',
  secundario: 'bg-raised border-line text-fg hover:border-fg-3',
  fantasma: 'bg-transparent border-transparent text-fg-2 hover:bg-raised hover:text-fg',
  perigo: 'bg-transparent border-danger/45 text-danger hover:bg-danger-soft',
  'perigo-solido': 'bg-danger-solid border-danger-solid text-white font-semibold hover:brightness-95',
}

const TAMANHO: Record<ButtonSize, string> = {
  p: 'h-[30px] px-2.5 text-[13px] rounded-[7px] max-sm:min-h-11',
  m: 'h-9 px-3.5 text-sm rounded-lg max-sm:min-h-11',
  g: 'h-11 px-[18px] text-[15px] rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariant
  tamanho?: ButtonSize
  icone?: ReactNode
  carregando?: boolean
}

export function buttonClassName({
  variante = 'secundario',
  tamanho = 'm',
  className,
}: {
  variante?: ButtonVariant
  tamanho?: ButtonSize
  className?: string
}) {
  return cn(BASE, VARIANTE[variante], TAMANHO[tamanho], className)
}

export function Button({
  variante = 'secundario',
  tamanho = 'm',
  icone,
  carregando = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={buttonClassName({ variante, tamanho, className })}
      {...rest}
    >
      {icone}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  rotulo: string
  icone: ReactNode
  borda?: boolean
}

// Alvo de toque de 44px no celular, a não ser que o chamador já defina o tamanho
// (h-*, w-* ou size-* sem prefixo de tela).
const TEM_TAMANHO = /(^|\s)(h|w|size)-/

export function IconButton({ rotulo, icone, borda = false, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'inline-grid h-[34px] w-[34px] flex-none place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-45',
        borda ? 'border border-line' : 'border border-transparent',
        !TEM_TAMANHO.test(className ?? '') && 'max-sm:h-11 max-sm:w-11',
        className,
      )}
      {...rest}
    >
      {icone}
    </button>
  )
}
