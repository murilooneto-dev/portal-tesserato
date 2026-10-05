'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'

export interface ItemMenu {
  rotulo: string
  icone?: ReactNode
  perigo?: boolean
  onSelecionar: () => void
}

// Botão ⋯ das fichas do cliente: abre uma lista curta de ações (Desabilitar,
// Excluir). Fecha com Esc, clique fora ou ao escolher; setas ↑ ↓ andam pelos itens.
export default function MenuMaisAcoes({ rotulo, itens }: { rotulo: string; itens: ItemMenu[] }) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    raiz.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      setAberto(false)
      raiz.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const opcoes = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (opcoes.length === 0) return
    e.preventDefault()
    const atual = opcoes.indexOf(document.activeElement as HTMLButtonElement)
    const passo = e.key === 'ArrowDown' ? 1 : -1
    opcoes[(atual + passo + opcoes.length) % opcoes.length].focus()
  }

  if (itens.length === 0) return null

  return (
    <div ref={raiz} className="relative" onKeyDown={aoTeclar}>
      <IconButton
        rotulo={rotulo}
        icone={<MoreHorizontal size={18} aria-hidden="true" />}
        borda
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => setAberto(v => !v)}
        className="h-9 w-9 max-sm:h-11 max-sm:w-11"
      />
      {aberto && (
        <div
          id={idMenu}
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 flex min-w-[200px] flex-col rounded-xl border border-line bg-raised p-1.5 shadow-modal"
        >
          {itens.map(item => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => { setAberto(false); item.onSelecionar() }}
              className={cn(
                'flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc max-sm:min-h-11',
                item.perigo ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-surface',
              )}
            >
              {item.icone}
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
