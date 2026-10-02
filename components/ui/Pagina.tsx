import type { ReactNode } from 'react'
import { cn } from './cn'

// Moldura do conteúdo de cada página dentro da casca: 16 px de respiro no
// celular, 32 px a partir de 640 px e 20 px entre os blocos.
export function Pagina({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7', className)}>{children}</div>
}

export function CabecalhoPagina({ titulo, subtitulo, acoes, className }: {
  titulo: ReactNode
  subtitulo?: ReactNode
  acoes?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-.01em] text-fg">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-fg-3">{subtitulo}</p>}
      </div>
      {acoes && <div className="ml-auto flex flex-wrap items-center gap-2.5 print:hidden">{acoes}</div>}
    </div>
  )
}
