'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'

interface Props {
  tarefasContent: ReactNode
  eventosContent: ReactNode
  dossieContent: ReactNode
  contagens?: Partial<Record<Aba, number>>
}

export type Aba = 'tarefas' | 'eventos' | 'dossie'

export const ABAS_MINHAS_TAREFAS: { id: Aba; rotulo: string }[] = [
  { id: 'tarefas', rotulo: 'Tarefas' },
  { id: 'eventos', rotulo: 'Eventos' },
  { id: 'dossie', rotulo: 'Dossiê' },
]

// As três abas ficam montadas (só escondidas): trocar de aba não perde o que
// foi digitado nem refaz consulta nenhuma.
export default function MinhasTarefasTabs({ tarefasContent, eventosContent, dossieContent, contagens }: Props) {
  const base = useId()
  const [aba, setAba] = useState<Aba>('tarefas')
  const idAba = (a: Aba) => `${base}-aba-${a}`
  const idPainel = (a: Aba) => `${base}-painel-${a}`
  const conteudo: Record<Aba, ReactNode> = { tarefas: tarefasContent, eventos: eventosContent, dossie: dossieContent }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const total = ABAS_MINHAS_TAREFAS.length
    let novo = indice
    if (e.key === 'ArrowRight') novo = (indice + 1) % total
    else if (e.key === 'ArrowLeft') novo = (indice - 1 + total) % total
    else if (e.key === 'Home') novo = 0
    else if (e.key === 'End') novo = total - 1
    else return
    e.preventDefault()
    setAba(ABAS_MINHAS_TAREFAS[novo].id)
    document.getElementById(idAba(ABAS_MINHAS_TAREFAS[novo].id))?.focus()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="tablist" aria-label="Seções de Minhas tarefas" className="flex border-b border-line-soft">
        {ABAS_MINHAS_TAREFAS.map((a, i) => {
          const ativa = aba === a.id
          const n = contagens?.[a.id]
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={idAba(a.id)}
              aria-controls={idPainel(a.id)}
              aria-selected={ativa}
              tabIndex={ativa ? 0 : -1}
              onClick={() => setAba(a.id)}
              onKeyDown={e => aoTeclar(e, i)}
              className={`-mb-px inline-flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:flex-none sm:px-4 ${
                ativa ? 'border-acc font-semibold text-fg' : 'border-transparent text-fg-3 hover:text-fg'
              }`}
            >
              {a.rotulo}
              {n !== undefined && <Badge tom={ativa ? 'acc' : 'neu'}>{n}</Badge>}
            </button>
          )
        })}
      </div>

      {ABAS_MINHAS_TAREFAS.map(a => (
        <div
          key={a.id}
          role="tabpanel"
          id={idPainel(a.id)}
          aria-labelledby={idAba(a.id)}
          className={`min-w-0 ${aba === a.id ? 'block' : 'hidden'}`}
        >
          {conteudo[a.id]}
        </div>
      ))}
    </div>
  )
}
