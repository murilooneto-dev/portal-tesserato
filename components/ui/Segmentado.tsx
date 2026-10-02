import type { KeyboardEvent } from 'react'
import { cn } from './cn'

export interface OpcaoSegmentada<T extends string> { valor: T; rotulo: string }

export function Segmentado<T extends string>({ rotulo, opcoes, valor, onMudar, disabled = false, className }: {
  rotulo: string
  opcoes: OpcaoSegmentada<T>[]
  valor: T
  onMudar: (v: T) => void
  disabled?: boolean
  className?: string
}) {
  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const proxima = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    if (!proxima && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const atual = opcoes.findIndex(o => o.valor === valor)
    // Sem opção ativa: seta para trás vai à última, para frente à primeira.
    const indice = atual < 0 ? (proxima ? 0 : opcoes.length - 1) : (atual + (proxima ? 1 : -1) + opcoes.length) % opcoes.length
    onMudar(opcoes[indice].valor)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[indice]?.focus()
  }
  const temAtivo = opcoes.some(o => o.valor === valor)
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      onKeyDown={teclado}
      className={cn('inline-flex h-9 max-w-full overflow-hidden rounded-[9px] border border-line bg-inset', className)}
    >
      {opcoes.map((o, i) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo || (!temAtivo && i === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onMudar(o.valor)}
            className={cn(
              'whitespace-nowrap border-l border-line px-3.5 text-sm text-fg-2 transition-colors first:border-l-0 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-60',
              ativo && 'bg-acc-soft font-semibold text-fg shadow-[inset_0_-2px_0_var(--acc)]',
            )}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}
