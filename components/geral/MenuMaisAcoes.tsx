'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'

export interface ItemMenu {
  rotulo: string
  icone?: ReactNode
  perigo?: boolean
  onSelecionar: () => void
}

// Botão ⋯ das fichas e das tabelas: abre uma lista curta de ações. Fecha com
// Esc, clique fora, rolagem ou ao escolher; setas ↑ ↓ andam pelos itens.
// A lista é posicionada na tela (fixed) a partir do botão, para o cartão da
// tabela (overflow-hidden) não cortá-la; abre para cima se faltar espaço embaixo.
export default function MenuMaisAcoes({ rotulo, itens }: { rotulo: string; itens: ItemMenu[] }) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<CSSProperties>({})
  const raiz = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    const fechar = () => setAberto(false)
    document.addEventListener('mousedown', aoClicarFora)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    raiz.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  function alternar() {
    if (aberto) { setAberto(false); return }
    const botao = raiz.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')
    if (botao) {
      const r = botao.getBoundingClientRect()
      const alturaEstimada = itens.length * 44 + 14
      const right = Math.max(8, window.innerWidth - r.right)
      setPosicao(r.bottom + 8 + alturaEstimada > window.innerHeight && r.top > alturaEstimada + 8
        ? { right, bottom: window.innerHeight - r.top + 8 }
        : { right, top: r.bottom + 8 })
    }
    setAberto(true)
  }

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
        onClick={alternar}
        className="h-9 w-9 max-sm:h-11 max-sm:w-11"
      />
      {aberto && (
        <div
          id={idMenu}
          role="menu"
          style={posicao}
          className="fixed z-50 flex min-w-[200px] flex-col rounded-xl border border-line bg-raised p-1.5 shadow-modal"
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
