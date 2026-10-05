'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Badge } from './Badge'
import { cn } from './cn'

export interface AbaItem<T extends string = string> {
  id: T
  rotulo: string
  conteudo: ReactNode
  contagem?: number
}

// Abas da página. Os painéis ficam todos montados (só escondidos): trocar de
// aba não perde o que foi digitado nem refaz consulta. Setas, Home e End
// andam entre as abas. Passe `ativa` + `onTrocar` para controlar por fora
// (ex.: guardar a aba na URL).
export function Abas<T extends string>({ abas, rotulo, inicial, ativa, onTrocar, className }: {
  abas: AbaItem<T>[]
  rotulo: string
  inicial?: T
  ativa?: T
  onTrocar?: (id: T) => void
  className?: string
}) {
  const base = useId()
  const [interna, setInterna] = useState<T>(inicial ?? abas[0].id)
  const atual = ativa ?? interna
  const idAba = (a: string) => `${base}-aba-${a}`
  const idPainel = (a: string) => `${base}-painel-${a}`

  function trocar(id: T) {
    setInterna(id)
    onTrocar?.(id)
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const total = abas.length
    let novo = indice
    if (e.key === 'ArrowRight') novo = (indice + 1) % total
    else if (e.key === 'ArrowLeft') novo = (indice - 1 + total) % total
    else if (e.key === 'Home') novo = 0
    else if (e.key === 'End') novo = total - 1
    else return
    e.preventDefault()
    trocar(abas[novo].id)
    document.getElementById(idAba(abas[novo].id))?.focus()
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-5', className)}>
      <div role="tablist" aria-label={rotulo} className="flex flex-wrap border-b border-line-soft print:hidden">
        {abas.map((a, i) => {
          const selecionada = atual === a.id
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={idAba(a.id)}
              aria-controls={idPainel(a.id)}
              aria-selected={selecionada}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => trocar(a.id)}
              onKeyDown={e => aoTeclar(e, i)}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4',
                selecionada ? 'border-acc font-semibold text-fg' : 'border-transparent text-fg-3 hover:text-fg',
              )}
            >
              {a.rotulo}
              {a.contagem !== undefined && <Badge tom={selecionada ? 'acc' : 'neu'}>{a.contagem}</Badge>}
            </button>
          )
        })}
      </div>
      {abas.map(a => (
        <div
          key={a.id}
          role="tabpanel"
          id={idPainel(a.id)}
          aria-labelledby={idAba(a.id)}
          hidden={atual !== a.id}
          className="min-w-0"
        >
          {a.conteudo}
        </div>
      ))}
    </div>
  )
}
