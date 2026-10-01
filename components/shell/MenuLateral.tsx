import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { estaAtivo, type GrupoMenu } from '@/lib/navegacao'
import { ICONE } from './icones-menu'

export function MenuLateral({ grupos, pathname, toque = false, onNavegar, className }: {
  grupos: GrupoMenu[]
  pathname: string
  toque?: boolean
  onNavegar?: () => void
  className?: string
}) {
  return (
    <nav aria-label="Menu" className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5', className)}>
      {grupos.map(grupo => (
        <div
          key={grupo.id}
          className={cn('flex flex-col gap-0.5', grupo.id === 'admin' && 'mt-auto border-t border-line-soft pt-3')}
        >
          <p className="px-2.5 pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-[.06em] text-fg-3 first:pt-1">{grupo.titulo}</p>
          {grupo.itens.map(item => {
            const ativo = estaAtivo(pathname, item.href)
            const Icone = ICONE[item.icone]
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavegar}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-[11px] rounded-lg px-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  toque ? 'h-11' : 'h-[38px]',
                  ativo ? 'bg-acc-soft text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg',
                )}
              >
                <Icone size={18} strokeWidth={1.75} aria-hidden="true" className={ativo ? 'text-acc-text' : undefined} />
                {item.rotulo}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
