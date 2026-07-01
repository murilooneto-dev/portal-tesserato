'use client'

import { createContext, useContext } from 'react'

interface MesAno {
  mes: number
  ano: number
}

const MesAnoContext = createContext<MesAno | null>(null)

export function MesAnoProvider({ mes, ano, children }: MesAno & { children: React.ReactNode }) {
  return <MesAnoContext.Provider value={{ mes, ano }}>{children}</MesAnoContext.Provider>
}

/** Mês/ano selecionado globalmente. Atualiza automaticamente quando o Sidebar troca de mês. */
export function useMesAno(): MesAno {
  const ctx = useContext(MesAnoContext)
  if (!ctx) throw new Error('useMesAno precisa estar dentro de MesAnoProvider')
  return ctx
}
