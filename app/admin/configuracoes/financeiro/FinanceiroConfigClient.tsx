'use client'

import { useState } from 'react'
import FinanceiroCatalogoTab from './FinanceiroCatalogoTab'

type Categoria = 'entrada' | 'saida' | 'centro_custo'

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'entrada', label: 'Tipos de Entrada' },
  { value: 'saida', label: 'Tipos de Saída' },
  { value: 'centro_custo', label: 'Centro de Custo' },
]

const botaoCls = (ativo: boolean) =>
  `px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
    ativo
      ? 'bg-[var(--accent)] text-[var(--fg)]'
      : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
  }`

export default function FinanceiroConfigClient() {
  const [categoria, setCategoria] = useState<Categoria>('entrada')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações — Financeiro</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">
        Tipos de Entrada, Tipos de Saída e Centro de Custo do setor Financeiro.
      </p>

      <div className="flex gap-2 mb-8 border-b border-[var(--fg)]/8 pb-4">
        {CATEGORIAS.map(c => (
          <button key={c.value} onClick={() => setCategoria(c.value)} className={botaoCls(categoria === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {categoria === 'entrada' && <FinanceiroCatalogoTab tipo="tipos" natureza="entrada" label="tipo de entrada" />}
      {categoria === 'saida' && <FinanceiroCatalogoTab tipo="tipos" natureza="saida" label="tipo de saída" />}
      {categoria === 'centro_custo' && <FinanceiroCatalogoTab tipo="centro_custo" label="centro de custo" />}
    </div>
  )
}
