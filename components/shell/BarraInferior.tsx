import Link from 'next/link'
import { Menu } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { estaAtivo, type ItemMenu } from '@/lib/navegacao'
import { ICONE } from './icones-menu'

const ITEM = 'flex min-h-11 flex-col items-center justify-center gap-[3px] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc'

export function BarraInferior({ atalhos, pathname, onMais, menuAberto }: { atalhos: ItemMenu[]; pathname: string; onMais: () => void; menuAberto: boolean }) {
  return (
    <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-line-soft bg-top print:hidden lg:hidden">
      {atalhos.map(item => {
        const ativo = estaAtivo(pathname, item.href)
        const Icone = ICONE[item.icone]
        return (
          <Link key={item.href} href={item.href} aria-current={ativo ? 'page' : undefined} className={cn(ITEM, ativo ? 'text-acc-text' : 'text-fg-3')}>
            <Icone size={22} aria-hidden="true" />
            <span className="max-w-full truncate px-1">{item.rotulo}</span>
          </Link>
        )
      })}
      <button type="button" onClick={onMais} aria-haspopup="dialog" aria-expanded={menuAberto} className={cn(ITEM, 'col-start-4 text-fg-3')}>
        <Menu size={22} aria-hidden="true" />
        Mais
      </button>
    </nav>
  )
}
