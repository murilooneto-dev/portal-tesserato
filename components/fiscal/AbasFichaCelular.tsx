'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export type AbaFicha = 'tarefas' | 'eventos' | 'historico' | 'arquivos'

export const ABAS_FICHA: { id: AbaFicha; rotulo: string }[] = [
  { id: 'tarefas', rotulo: 'Tarefas' },
  { id: 'eventos', rotulo: 'Eventos' },
  { id: 'historico', rotulo: 'Histórico' },
  { id: 'arquivos', rotulo: 'Arquivos' },
]

export interface PainelFicha {
  chave: string
  aba: AbaFicha
  conteudo: ReactNode
}

// Da ficha do cliente. Os painéis chegam prontos (renderizados no servidor).
// A partir de 1024 px tudo aparece em duas colunas; abaixo disso só o painel
// da aba escolhida fica visível. Nada é buscado de novo ao trocar de aba.
export default function AbasFichaCelular({ principal, lateral }: { principal: PainelFicha[]; lateral: PainelFicha[] }) {
  const base = useId()
  const [ativa, setAtiva] = useState<AbaFicha>('tarefas')
  const idAba = (a: AbaFicha) => `${base}-aba-${a}`
  const idPainel = (a: AbaFicha) => `${base}-painel-${a}`

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let novo = indice
    if (e.key === 'ArrowRight') novo = (indice + 1) % ABAS_FICHA.length
    else if (e.key === 'ArrowLeft') novo = (indice - 1 + ABAS_FICHA.length) % ABAS_FICHA.length
    else if (e.key === 'Home') novo = 0
    else if (e.key === 'End') novo = ABAS_FICHA.length - 1
    else return
    e.preventDefault()
    setAtiva(ABAS_FICHA[novo].id)
    document.getElementById(idAba(ABAS_FICHA[novo].id))?.focus()
  }

  const renderPaineis = (lista: PainelFicha[]) => lista.map(p => (
    <div
      key={p.chave}
      role="tabpanel"
      id={`${idPainel(p.aba)}-${p.chave}`}
      aria-labelledby={idAba(p.aba)}
      className={`${ativa === p.aba ? 'block' : 'hidden'} min-w-0 empty:hidden lg:block`}
    >
      {p.conteudo}
    </div>
  ))

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="tablist"
        aria-label="Seções da ficha"
        className="-mx-4 flex border-b border-line-soft px-2 sm:mx-0 sm:px-0 lg:hidden"
      >
        {ABAS_FICHA.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={idAba(a.id)}
            aria-selected={ativa === a.id}
            tabIndex={ativa === a.id ? 0 : -1}
            onClick={() => setAtiva(a.id)}
            onKeyDown={e => aoTeclar(e, i)}
            className={`-mb-px min-h-11 flex-1 border-b-2 px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
              ativa === a.id ? 'border-acc text-fg' : 'border-transparent text-fg-3 hover:text-fg'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 empty:hidden">{renderPaineis(principal)}</div>
        <div className="flex min-w-0 flex-col gap-4 empty:hidden">{renderPaineis(lateral)}</div>
      </div>
    </div>
  )
}
