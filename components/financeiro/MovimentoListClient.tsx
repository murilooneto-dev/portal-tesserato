'use client'

import { useMemo, useState, useTransition } from 'react'
import { excluirMovimento } from '@/lib/financeiro-actions'
import { normalizarNome } from '@/lib/config-entidades'
import type { FinanceiroNatureza } from '@/lib/types'
import NovoMovimentoModal from './NovoMovimentoModal'

export interface MovimentoLinha {
  id: string
  tipo_id: string
  centro_custo_id: string | null
  valor: number
  data: string
  observacao: string | null
  tipo_nome: string
  centro_custo_nome: string | null
  created_at: string
}

interface Props {
  natureza: FinanceiroNatureza
  titulo: string
  botaoNovo: string
  movimentos: MovimentoLinha[]
}

type Ordenacao = 'lancamento' | 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'

const OPCOES_ORDENACAO: { value: Ordenacao; label: string }[] = [
  { value: 'lancamento', label: 'Mais recente lançado' },
  { value: 'data_desc', label: 'Data (mais recente)' },
  { value: 'data_asc', label: 'Data (mais antiga)' },
  { value: 'valor_desc', label: 'Maior valor' },
  { value: 'valor_asc', label: 'Menor valor' },
]

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MovimentoListClient({ natureza, titulo, botaoNovo, movimentos }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<MovimentoLinha | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('lancamento')

  function handleExcluir(id: string) {
    startTransition(() => { excluirMovimento(id, natureza) })
    setExcluindoId(null)
  }

  const movimentosFiltrados = useMemo(() => {
    const termo = normalizarNome(busca)
    let lista = movimentos
    if (termo) {
      lista = lista.filter(m =>
        normalizarNome(m.tipo_nome).includes(termo) ||
        normalizarNome(m.centro_custo_nome ?? '').includes(termo) ||
        normalizarNome(m.observacao ?? '').includes(termo)
      )
    }
    lista = [...lista].sort((a, b) => {
      switch (ordenacao) {
        case 'data_desc': return b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)
        case 'data_asc': return a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at)
        case 'valor_desc': return b.valor - a.valor
        case 'valor_asc': return a.valor - b.valor
        case 'lancamento':
        default: return b.created_at.localeCompare(a.created_at)
      }
    })
    return lista
  }, [movimentos, busca, ordenacao])

  const total = movimentosFiltrados.reduce((acc, m) => acc + m.valor, 0)

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

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por tipo, centro de custo ou observação..."
          className={inputCls + ' flex-1 min-w-[200px]'}
        />
        <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)} className={inputCls}>
          {OPCOES_ORDENACAO.map(o => (
            <option key={o.value} value={o.value} className="bg-[var(--bg-surface)]">{o.label}</option>
          ))}
        </select>
      </div>

      {movimentosFiltrados.length === 0 ? (
        <p className="text-[var(--fg)]/30 text-sm py-6 text-center">
          {movimentos.length === 0 ? 'Nenhum lançamento ainda.' : 'Nenhum lançamento encontrado com esse filtro.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {movimentosFiltrados.map(m => (
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
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditando(m)}
                    className="text-[var(--fg)]/40 hover:text-[var(--fg)] text-xs transition-colors">Editar</button>
                  <button onClick={() => setExcluindoId(m.id)}
                    className="text-[var(--fg)]/25 hover:text-red-400 text-xs transition-colors">×</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <NovoMovimentoModal natureza={natureza} onClose={() => setModalAberto(false)} />
      )}

      {editando && (
        <NovoMovimentoModal
          natureza={natureza}
          onClose={() => setEditando(null)}
          movimento={{
            id: editando.id,
            tipoId: editando.tipo_id,
            tipoNome: editando.tipo_nome,
            centroCustoId: editando.centro_custo_id,
            centroCustoNome: editando.centro_custo_nome,
            valor: editando.valor,
            data: editando.data,
            observacao: editando.observacao,
          }}
        />
      )}
    </div>
  )
}
