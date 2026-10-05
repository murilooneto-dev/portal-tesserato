import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

// Trilha acima do título: "Configurações › Fiscal". O último item é a página
// atual (sem link).
export function Caminho({ itens }: { itens: { rotulo: string; href?: string }[] }) {
  return (
    <nav aria-label="Caminho" className="-mb-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3 print:hidden">
      {itens.map((item, i) => {
        const ultimo = i === itens.length - 1
        return (
          <Fragment key={`${item.rotulo}-${i}`}>
            {i > 0 && <ChevronRight size={14} aria-hidden="true" className="flex-none" />}
            {item.href && !ultimo
              ? <Link href={item.href} className="flex-none transition-colors hover:text-fg">{item.rotulo}</Link>
              : <b className="min-w-0 truncate font-medium text-fg-2" aria-current={ultimo ? 'page' : undefined}>{item.rotulo}</b>}
          </Fragment>
        )
      })}
    </nav>
  )
}
