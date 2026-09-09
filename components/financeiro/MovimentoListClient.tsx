'use client'

import { useState, useTransition } from 'react'
import { excluirMovimento } from '@/lib/financeiro-actions'
import type { FinanceiroNatureza } from '@/lib/types'
import NovoMovimentoModal from './NovoMovimentoModal'

export interface MovimentoLinha {
  id: string
  valor: number
  data: string
  observacao: string | null
  tipo_nome: string
  centro_custo_nome: string | null
}

interface Props {
  natureza: FinanceiroNatureza
  titulo: string
  botaoNovo: string
  movimentos: MovimentoLinha[]
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MovimentoListClient({ natureza, titulo, botaoNovo, movimentos }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleExcluir(id: string) {
    startTransition(() => { excluirMovimento(id, natureza) })
    setExcluindoId(null)
  }

  const total = movimentos.reduce((acc, m) => acc + m.valor, 0)

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">{titulo}</h1>
          <p className="text-[var(--fg)]/40 text-sm mt-1">Total: {formatarValor(total)}</p>
        </div>
        <button onClick={() => setModalAberto(true)}
          className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
          {botaoNovo}
        </button>
      </div>

      {movimentos.length === 0 ? (
        <p className="text-[var(--fg)]/30 text-sm py-6 text-center">Nenhum lançamento ainda.</p>
      ) : (
        <ul className="space-y-2">
          {movimentos.map(m => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--fg)]">{m.tipo_nome}</p>
                <p className="text-[10px] text-[var(--fg)]/40 mt-0.5">
                  {formatarData(m.data)}{m.centro_custo_nome ? ` · ${m.centro_custo_nome}` : ''}{m.observacao ? ` · ${m.observacao}` : ''}
                </p>
              </div>
              <span className="text-sm font-semibold text-[var(--fg)] shrink-0">{formatarValor(m.valor)}</span>
              {excluindoId === m.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleExcluir(m.id)} disabled={isPending}
                    className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-1 rounded-md">Confirmar</button>
                  <button onClick={() => setExcluindoId(null)}
                    className="text-[10px] text-[var(--fg)]/40 px-1">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setExcluindoId(m.id)}
                  className="text-[var(--fg)]/25 hover:text-red-400 text-xs shrink-0 transition-colors">×</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <NovoMovimentoModal natureza={natureza} onClose={() => setModalAberto(false)} />
      )}
    </div>
  )
}
