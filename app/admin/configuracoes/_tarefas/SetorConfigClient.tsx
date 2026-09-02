// app/admin/configuracoes/_tarefas/SetorConfigClient.tsx
'use client'

import { useState } from 'react'
import type { UserSetor } from '@/lib/types'
import { SETOR_LABEL } from '@/lib/types'
import EntidadeListaTab from './EntidadeListaTab'
import TarefasTab from './TarefasTab'

type Categoria = 'regimes' | 'atividades' | 'tarefas'

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'regimes', label: 'Regimes' },
  { value: 'atividades', label: 'Atividades' },
  { value: 'tarefas', label: 'Tarefas' },
]

const botaoCls = (ativo: boolean) =>
  `px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
    ativo
      ? 'bg-[var(--accent)] text-[var(--fg)]'
      : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
  }`

interface Props {
  setor: UserSetor
}

export default function SetorConfigClient({ setor }: Props) {
  const [categoria, setCategoria] = useState<Categoria>('regimes')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações — {SETOR_LABEL[setor]}</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">
        Regimes, Atividades e Tarefas do setor {SETOR_LABEL[setor]}.
      </p>

      <div className="flex gap-2 mb-8 border-b border-[var(--fg)]/8 pb-4">
        {CATEGORIAS.map(c => (
          <button key={c.value} onClick={() => setCategoria(c.value)} className={botaoCls(categoria === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {categoria === 'regimes' && <EntidadeListaTab tabela="regimes" entidadeTipoVinculo="regime" setor={setor} label="Regime" />}
      {categoria === 'atividades' && <EntidadeListaTab tabela="atividades" entidadeTipoVinculo="atividade" setor={setor} label="Atividade" />}
      {categoria === 'tarefas' && <TarefasTab setor={setor} />}
    </div>
  )
}
