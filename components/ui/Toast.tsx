'use client'

import { createContext, useCallback, useContext, useReducer, useRef, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from './cn'

export interface AvisoSalvo { id: number; texto: string; tom: 'ok' | 'dng' | 'info' }
type Acao = { tipo: 'adicionar'; aviso: AvisoSalvo } | { tipo: 'remover'; id: number }

const MAXIMO = 3

export function filaDeAvisos(fila: AvisoSalvo[], acao: Acao): AvisoSalvo[] {
  if (acao.tipo === 'remover') return fila.filter(a => a.id !== acao.id)
  return [...fila, acao.aviso].slice(-MAXIMO)
}

type Mostrar = (texto: string, tom?: AvisoSalvo['tom']) => void
const ToastContext = createContext<Mostrar | null>(null)

const ICONE = { ok: CheckCircle2, dng: AlertCircle, info: Info }
const COR = { ok: 'text-ok', dng: 'text-danger', info: 'text-info' }
const BORDA = { ok: 'border-line', dng: 'border-danger/60', info: 'border-line' }

// No celular e no tablet os botões flutuantes ficam em bottom-[84px] com 52px
// de altura; o aviso sobe acima deles. No desktop fica no canto, como antes.
export const POSICAO_TOAST =
  'pointer-events-none fixed inset-x-4 bottom-[148px] z-[80] flex flex-col gap-2 sm:inset-x-auto sm:right-4 lg:bottom-4'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [fila, despachar] = useReducer(filaDeAvisos, [])
  const proximoId = useRef(1)

  const mostrar = useCallback<Mostrar>((texto, tom = 'ok') => {
    const id = proximoId.current++
    despachar({ tipo: 'adicionar', aviso: { id, texto, tom } })
    setTimeout(() => despachar({ tipo: 'remover', id }), 4000)
  }, [])

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div aria-live="polite" role="status" className={POSICAO_TOAST}>
        {fila.map(a => {
          const Icone = ICONE[a.tom]
          return (
            <div key={a.id} className={cn('pointer-events-auto flex items-center gap-2.5 rounded-[10px] border bg-raised px-4 py-3 text-sm text-fg shadow-modal', BORDA[a.tom], a.tom === 'dng' && 'border-l-4')}>
              <Icone size={18} aria-hidden="true" className={cn('flex-none', COR[a.tom])} />
              {a.tom === 'dng' && <span className="sr-only">Erro: </span>}
              <span className="min-w-0">{a.texto}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Mostrar {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider> (montado em app/layout.tsx)')
  return ctx
}
