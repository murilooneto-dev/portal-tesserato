import { cn } from './cn'

// Carregamento com o formato da tela, sem "Carregando…" solto (ds-06).
// O pulsar para quando o sistema pede menos movimento (motion-safe).
const BLOCO = 'rounded-md bg-raised motion-safe:animate-pulse'

// Larguras alternadas para a lista não parecer uma grade.
const LARGURAS = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3']

export function EsqueletoLinhas({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn('flex flex-col gap-2.5', className)}>
      <span className="sr-only">Carregando</span>
      {Array.from({ length: Math.max(1, linhas) }, (_, i) => (
        <span key={i} aria-hidden="true" className={cn(BLOCO, 'block h-4', LARGURAS[i % LARGURAS.length])} />
      ))}
    </div>
  )
}

export function EsqueletoCartao({ className }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn('flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4', className)}>
      <span className="sr-only">Carregando</span>
      <span aria-hidden="true" className={cn(BLOCO, 'block h-5 w-1/2')} />
      <span aria-hidden="true" className={cn(BLOCO, 'block h-3.5 w-1/3')} />
      <span aria-hidden="true" className={cn(BLOCO, 'block h-2 w-full')} />
    </div>
  )
}
