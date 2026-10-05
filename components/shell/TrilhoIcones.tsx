import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { estaAtivo, rotuloCurto, type GrupoMenu } from '@/lib/navegacao'
import { ICONE } from './icones-menu'

// Tablet (768–1023 px, nav-07): trilho de 72 px com ícone e rótulo curto.
// O menu completo continua no botão do topo (gaveta).
export function TrilhoIcones({ grupos, pathname }: { grupos: GrupoMenu[]; pathname: string }) {
  return (
    <nav aria-label="Menu" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {grupos.map((grupo, i) => (
        <div key={grupo.id} className={cn('flex flex-col items-center gap-1', i > 0 && 'mt-1 border-t border-line-soft pt-2')}>
          {grupo.itens.map(item => {
            const ativo = estaAtivo(pathname, item.href)
            const Icone = ICONE[item.icone]
            const curto = rotuloCurto(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                aria-label={curto !== item.rotulo ? item.rotulo : undefined}
                title={item.rotulo}
                className={cn(
                  'flex min-h-11 w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  ativo ? 'bg-acc-soft text-acc-text' : 'text-fg-2 hover:bg-raised hover:text-fg',
                )}
              >
                <Icone size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="max-w-full truncate leading-tight">{curto}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
