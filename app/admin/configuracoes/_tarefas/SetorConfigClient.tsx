// app/admin/configuracoes/ConfiguracoesClient.tsx
'use client'

import { useState } from 'react'
import type { UserSetor } from '@/lib/types'
import EntidadeListaTab from './EntidadeListaTab'
import TarefasTab from './TarefasTab'

const SETORES: { value: UserSetor; label: string }[] = [
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'contabil', label: 'Contábil' },
  { value: 'pessoal', label: 'Pessoal' },
]

type Categoria = 'grupos' | 'regimes' | 'atividades' | 'tarefas'

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'grupos', label: 'Grupos' },
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

export default function ConfiguracoesClient() {
  const [setor, setSetor] = useState<UserSetor>('fiscal')
  const [categoria, setCategoria] = useState<Categoria>('grupos')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">
        Grupos, Regimes, Atividades e Tarefas por setor.
      </p>

      <div className="flex gap-2 mb-4">
        {SETORES.map(s => (
          <button key={s.value} onClick={() => setSetor(s.value)} className={botaoCls(setor === s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-8 border-b border-[var(--fg)]/8 pb-4">
        {CATEGORIAS.map(c => (
          <button key={c.value} onClick={() => setCategoria(c.value)} className={botaoCls(categoria === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {categoria === 'grupos' && <EntidadeListaTab tabela="grupos" entidadeTipoVinculo="grupo" setor={setor} label="Grupo" />}
      {categoria === 'regimes' && <EntidadeListaTab tabela="regimes" entidadeTipoVinculo="regime" setor={setor} label="Regime" />}
      {categoria === 'atividades' && <EntidadeListaTab tabela="atividades" entidadeTipoVinculo="atividade" setor={setor} label="Atividade" />}
      {categoria === 'tarefas' && <TarefasTab setor={setor} />}
    </div>
  )
}
