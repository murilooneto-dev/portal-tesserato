'use client'

import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export function ConfirmDialog({
  aberto, titulo, descricao, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar',
  perigo = false, carregando = false, onConfirmar, onCancelar,
}: {
  aberto: boolean
  titulo: ReactNode
  descricao?: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  perigo?: boolean
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const idDesc = useId()
  return (
    <Modal
      aberto={aberto}
      onFechar={onCancelar}
      titulo={titulo}
      largura="p"
      bloqueado={carregando}
      idDescricao={descricao ? idDesc : undefined}
      icone={perigo ? (
        <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-danger-soft text-danger" aria-hidden="true">
          <AlertTriangle size={18} />
        </span>
      ) : undefined}
      rodape={
        <div className="ml-auto flex gap-2.5">
          <Button variante="fantasma" onClick={onCancelar} disabled={carregando} data-autofocus="">{textoCancelar}</Button>
          <Button variante={perigo ? 'perigo-solido' : 'primario'} onClick={onConfirmar} carregando={carregando}>{textoConfirmar}</Button>
        </div>
      }
    >
      {descricao && <div id={idDesc} className="text-sm leading-relaxed text-fg-2">{descricao}</div>}
    </Modal>
  )
}

export interface OpcoesConfirmacao {
  titulo: string
  descricao?: string
  textoConfirmar?: string
  perigo?: boolean
}

type Confirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>

const ConfirmContext = createContext<Confirmar | null>(null)

// Troca o window.confirm(): const confirmar = useConfirmar(); if (await confirmar({...})) {...}
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmacao | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirmar = useCallback<Confirmar>(o => new Promise<boolean>(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setOpcoes(o)
  }), [])

  function responder(v: boolean) {
    resolver.current?.(v)
    resolver.current = null
    setOpcoes(null)
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <ConfirmDialog
        aberto={opcoes !== null}
        titulo={opcoes?.titulo ?? ''}
        descricao={opcoes?.descricao}
        textoConfirmar={opcoes?.textoConfirmar}
        perigo={opcoes?.perigo}
        onConfirmar={() => responder(true)}
        onCancelar={() => responder(false)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirmar(): Confirmar {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmar precisa estar dentro de <ConfirmProvider> (montado em app/layout.tsx)')
  return ctx
}
