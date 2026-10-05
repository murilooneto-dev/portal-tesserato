'use client'

import { useEffect, useLayoutEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'
import { cliqueNaBarraDeRolagem, podeFechar, proximoIndiceDeFoco, SELETOR_FOCAVEL, type MotivoFechar, abrirNaPilha, fecharNaPilha, estaNoTopo, salvarEBloquearScroll, restaurarScroll } from './overlay'

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

function Cabecalho({ idTitulo, idSub, titulo, subtitulo, icone, onFechar, bloqueado, comAlca = false, fecharGrande = false }: {
  idTitulo: string; idSub: string; titulo: ReactNode; subtitulo?: ReactNode; icone?: ReactNode; onFechar: () => void; bloqueado: boolean; comAlca?: boolean; fecharGrande?: boolean
}) {
  return (
    <div className={cn('flex flex-none items-start gap-3 border-b border-line-soft px-4 sm:px-[22px] sm:py-[18px]', comAlca ? 'pb-3 pt-2.5' : 'py-3.5')}>
      {icone}
      <div className="min-w-0 flex-1">
        <h2 id={idTitulo} className="text-[17px] font-semibold text-fg">{titulo}</h2>
        {subtitulo && <p id={idSub} className="mt-0.5 text-[13px] text-fg-3">{subtitulo}</p>}
      </div>
      <IconButton rotulo="Fechar (Esc)" icone={<X size={18} aria-hidden="true" />} onClick={onFechar} disabled={bloqueado} data-fechar="" className={fecharGrande ? '-my-2 -mr-2 h-11 w-11' : 'max-sm:-my-2 max-sm:-mr-2 max-sm:h-11 max-sm:w-11'} />
    </div>
  )
}

const LARGURA = { p: 'max-w-[520px]', m: 'max-w-[640px]', g: 'max-w-[780px]' } as const

// Rodapé: no celular os botões ocupam a largura e têm 48px de altura (mob-07).
const RODAPE =
  'flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5 ' +
  'max-sm:flex-wrap max-sm:px-4 max-sm:pb-[max(14px,env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1 max-sm:[&_button]:min-h-12 max-sm:[&_button]:flex-1'

// Gaveta: rodapé sem esticar botões (a gaveta do menu tem avatar + ícones no rodapé).
const RODAPE_GAVETA =
  'flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5 max-sm:px-4 max-sm:pb-[max(14px,env(safe-area-inset-bottom))]'

// Alça do bottom sheet (só no celular).
function Alca() {
  return <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-9 flex-none rounded-sm bg-line sm:hidden" />
}

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
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[var(--scrim)] sm:items-start sm:p-10"
      onMouseDown={e => { if (e.target === e.currentTarget && !cliqueNaBarraDeRolagem(e.clientX - e.currentTarget.getBoundingClientRect().left, e.currentTarget.clientWidth)) tentarFechar('fundo') }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescricao ?? (subtitulo ? idSub : undefined)}
        tabIndex={-1}
        className={cn(
          'flex w-full flex-col overflow-hidden border border-line bg-surface shadow-modal',
          // celular: abre de baixo (bottom sheet), largura toda, rolagem interna
          'max-h-[90dvh] rounded-t-[18px] border-x-0 border-b-0',
          'sm:max-h-none sm:rounded-[14px] sm:border-x sm:border-b',
          LARGURA[largura],
        )}
      >
        <Alca />
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} comAlca />
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 py-5 sm:overflow-visible sm:px-[22px]">{children}</div>
        {rodape && <div className={RODAPE}>{rodape}</div>}
      </div>
    </div>
  )
}

export function Drawer({
  aberto, onFechar, titulo, subtitulo, icone, rodape, children,
  larguraPx = 520, fecharAoClicarFora = true, bloqueado = false, idDescricao, lado = 'direita', fecharGrande = false,
}: BaseProps & { larguraPx?: number; lado?: 'esquerda' | 'direita'; fecharGrande?: boolean }) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idSub = useId()
  const tentarFechar = (m: MotivoFechar) => { if (podeFechar(m, { bloqueado, fecharAoClicarFora })) onFechar() }
  useJanela(aberto, painel, tentarFechar)
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-[70] bg-[var(--scrim)]"
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
        className={cn(
          'absolute top-0 flex h-full flex-col border-line bg-surface shadow-modal',
          lado === 'esquerda' ? 'left-0 border-r' : 'right-0 border-l',
        )}
      >
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} fecharGrande={fecharGrande} />
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-[22px]">{children}</div>
        {rodape && <div className={RODAPE_GAVETA}>{rodape}</div>}
      </div>
    </div>
  )
}
