'use client'

import { useState, type ReactNode } from 'react'

interface Props {
  tarefasContent: ReactNode
  meusClientesContent: ReactNode | null
  eventosContent: ReactNode | null
  dossieContent: ReactNode
}

type Aba = 'tarefas' | 'meus-clientes' | 'eventos' | 'dossie'

export default function MinhasTarefasTabs({ tarefasContent, meusClientesContent, eventosContent, dossieContent }: Props) {
  const [aba, setAba] = useState<Aba>('tarefas')

  const tabCls = (ativa: boolean) => `px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
    ativa
      ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
      : 'text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/5'
  }`

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 border-b border-[var(--fg)]/8 pb-3">
        <button onClick={() => setAba('tarefas')} className={tabCls(aba === 'tarefas')}>Tarefas</button>
        {meusClientesContent && (
          <button onClick={() => setAba('meus-clientes')} className={tabCls(aba === 'meus-clientes')}>Meus Clientes</button>
        )}
        {eventosContent && (
          <button onClick={() => setAba('eventos')} className={tabCls(aba === 'eventos')}>Eventos</button>
        )}
        <button onClick={() => setAba('dossie')} className={tabCls(aba === 'dossie')}>Dossiê</button>
      </div>

      <div style={{ display: aba === 'tarefas' ? 'block' : 'none' }}>{tarefasContent}</div>
      {meusClientesContent && (
        <div style={{ display: aba === 'meus-clientes' ? 'block' : 'none' }}>{meusClientesContent}</div>
      )}
      {eventosContent && (
        <div style={{ display: aba === 'eventos' ? 'block' : 'none' }}>{eventosContent}</div>
      )}
      <div style={{ display: aba === 'dossie' ? 'block' : 'none' }}>{dossieContent}</div>
    </div>
  )
}
