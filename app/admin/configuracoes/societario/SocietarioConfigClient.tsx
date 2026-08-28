// app/admin/configuracoes/societario/SocietarioConfigClient.tsx
'use client'

import { useState } from 'react'
import ProcessosTab from './ProcessosTab'
import DocumentacoesTab from './DocumentacoesTab'

type Categoria = 'processos' | 'documentacoes'

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'processos', label: 'Processos' },
  { value: 'documentacoes', label: 'Documentações' },
]

const botaoCls = (ativo: boolean) =>
  `px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
    ativo
      ? 'bg-[var(--accent)] text-[var(--fg)]'
      : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
  }`

export default function SocietarioConfigClient() {
  const [categoria, setCategoria] = useState<Categoria>('processos')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações — Societário</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">Tipos de processo e modelos de documentação.</p>

      <div className="flex gap-2 mb-8 border-b border-[var(--fg)]/8 pb-4">
        {CATEGORIAS.map(c => (
          <button key={c.value} onClick={() => setCategoria(c.value)} className={botaoCls(categoria === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {categoria === 'processos' && <ProcessosTab />}
      {categoria === 'documentacoes' && <DocumentacoesTab />}
    </div>
  )
}
