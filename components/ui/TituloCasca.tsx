'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { cn } from './cn'

// A casca mostra o título da página na barra do topo do celular. Quando o h1
// do CabecalhoPagina diz a mesma coisa, ele fica só para leitor de tela abaixo
// de sm (sem repetir na tela). Títulos diferentes (nome do cliente na ficha)
// continuam visíveis.
const TituloCascaContext = createContext<string | null>(null)

export function TituloCascaProvider({ titulo, children }: { titulo: string | null; children: ReactNode }) {
  return <TituloCascaContext.Provider value={titulo}>{children}</TituloCascaContext.Provider>
}

const normalizar = (s: string) => s.trim().toLocaleLowerCase('pt-BR')

export function repeteTituloDaCasca(titulo: ReactNode, tituloCasca: string | null): boolean {
  return typeof titulo === 'string' && tituloCasca !== null && normalizar(titulo) === normalizar(tituloCasca)
}

export function TituloPagina({ children }: { children: ReactNode }) {
  const tituloCasca = useContext(TituloCascaContext)
  return (
    <h1 className={cn('text-2xl font-semibold leading-tight tracking-[-.01em] text-fg', repeteTituloDaCasca(children, tituloCasca) && 'max-sm:sr-only')}>
      {children}
    </h1>
  )
}
