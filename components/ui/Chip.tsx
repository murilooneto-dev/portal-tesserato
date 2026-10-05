import type { ButtonHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'

// Opção liga/desliga em forma de pílula (filtros, setores do cliente).
export function Chip({ ativo, className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ativo: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={ativo}
      className={cn(
        'inline-flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-60',
        ativo ? 'border-[color-mix(in_srgb,var(--acc)_55%,transparent)] bg-acc-soft text-fg' : 'border-line text-fg-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {ativo && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </button>
  )
}
