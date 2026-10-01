'use client'

import { useEffect, useLayoutEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'
import { podeFechar, proximoIndiceDeFoco, SELETOR_FOCAVEL, type MotivoFechar, abrirNaPilha, fecharNaPilha, estaNoTopo, salvarEBloquearScroll, restaurarScroll } from './overlay'

interface BaseProps {
  aberto: boolean
  onFechar: () => void
  titulo: ReactNode
  subtitulo?: ReactNode
  icone?: ReactNode
  rodape?: ReactNode
  fecharAoClicarFora?: boolean
  bloqueado?: boolean
  idDescricao?: string
  children?: ReactNode
}

// Comportamento comum: Esc, foco preso dentro, foco volta ao elemento de
// origem ao fechar e rolagem da página travada enquanto aberta.
// `tentarFechar` muda a cada render; fica num ref para o efeito rodar só ao
// abrir/fechar (senão o foco pularia para o primeiro campo a cada tecla).
function useJanela(aberto: boolean, painel: RefObject<HTMLDivElement | null>, tentarFechar: (m: MotivoFechar) => void) {
  const fecharRef = useRef(tentarFechar)
  const idRef = useRef(Symbol('janela'))
  useLayoutEffect(() => {
    fecharRef.current = tentarFechar
  })
  useEffect(() => {
    if (!aberto) return
    const id = idRef.current
    const anterior = document.activeElement as HTMLElement | null
    salvarEBloquearScroll()
    abrirNaPilha(id)

    const focaveis = () => Array.from(painel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL) ?? [])

    // Foco inicial: autofocus > primeiro sem data-fechar > painel
    const comAutofocus = painel.current?.querySelector<HTMLElement>('[data-autofocus]')
    if (comAutofocus) {
      comAutofocus.focus()
    } else {
      const semFechar = focaveis().find(el => !el.hasAttribute('data-fechar'))
      if (semFechar) {
        semFechar.focus()
      } else {
        painel.current?.focus()
      }
    }

    function onKey(e: KeyboardEvent) {
      if (!estaNoTopo(id) || e.defaultPrevented || e.isComposing) return
      if (e.key === 'Escape') { e.preventDefault(); fecharRef.current('esc'); return }
      if (e.key !== 'Tab') return
      const itens = focaveis()
      if (itens.length === 0) { e.preventDefault(); return }
      const atual = itens.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      itens[proximoIndiceDeFoco(itens.length, atual, e.shiftKey)]?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      fecharNaPilha(id)
      restaurarScroll()
      anterior?.focus?.()
    }
  }, [aberto, painel])
}

function Cabecalho({ idTitulo, idSub, titulo, subtitulo, icone, onFechar, bloqueado }: {
  idTitulo: string; idSub: string; titulo: ReactNode; subtitulo?: ReactNode; icone?: ReactNode; onFechar: () => void; bloqueado: boolean
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line-soft px-[22px] py-[18px]">
      {icone}
      <div className="min-w-0 flex-1">
        <h2 id={idTitulo} className="text-[17px] font-semibold text-fg">{titulo}</h2>
        {subtitulo && <p id={idSub} className="mt-0.5 text-[13px] text-fg-3">{subtitulo}</p>}
      </div>
      <IconButton rotulo="Fechar (Esc)" icone={<X size={18} aria-hidden="true" />} onClick={onFechar} disabled={bloqueado} data-fechar="" />
    </div>
  )
}

const LARGURA = { p: 'max-w-[520px]', m: 'max-w-[640px]', g: 'max-w-[780px]' } as const

export function Modal({
  aberto, onFechar, titulo, subtitulo, icone, rodape, children,
  largura = 'm', fecharAoClicarFora = true, bloqueado = false, idDescricao,
}: BaseProps & { largura?: keyof typeof LARGURA }) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idSub = useId()
  const tentarFechar = (m: MotivoFechar) => { if (podeFechar(m, { bloqueado, fecharAoClicarFora })) onFechar() }
  useJanela(aberto, painel, tentarFechar)
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-4 sm:p-10"
      onMouseDown={e => { if (e.target === e.currentTarget) tentarFechar('fundo') }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescricao ?? (subtitulo ? idSub : undefined)}
        tabIndex={-1}
        className={cn('flex w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-modal', LARGURA[largura])}
      >
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} />
        <div className="flex flex-col gap-5 px-[22px] py-5">{children}</div>
        {rodape && <div className="flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5">{rodape}</div>}
      </div>
    </div>
  )
}

export function Drawer({
  aberto, onFechar, titulo, subtitulo, icone, rodape, children,
  larguraPx = 520, fecharAoClicarFora = true, bloqueado = false, idDescricao,
}: BaseProps & { larguraPx?: number }) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idSub = useId()
  const tentarFechar = (m: MotivoFechar) => { if (podeFechar(m, { bloqueado, fecharAoClicarFora })) onFechar() }
  useJanela(aberto, painel, tentarFechar)
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--scrim)]"
      onMouseDown={e => { if (e.target === e.currentTarget) tentarFechar('fundo') }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescricao ?? (subtitulo ? idSub : undefined)}
        tabIndex={-1}
        style={{ width: `min(${larguraPx}px, 100vw)` }}
        className="absolute right-0 top-0 flex h-full flex-col border-l border-line bg-surface shadow-modal"
      >
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} />
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5">{children}</div>
        {rodape && <div className="flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5">{rodape}</div>}
      </div>
    </div>
  )
}
