'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FinanceiroNatureza } from '@/lib/types'
import {
  listarFinanceiroTipos, criarFinanceiroTipo, renomearFinanceiroTipo, alternarAtivoFinanceiroTipo, excluirFinanceiroTipo,
  listarFinanceiroCentrosCusto, criarFinanceiroCentroCusto, renomearFinanceiroCentroCusto, alternarAtivoFinanceiroCentroCusto, excluirFinanceiroCentroCusto,
} from '@/lib/financeiro-actions'
import { ordenarPorNome } from '@/lib/config-entidades'

interface Item { id: string; nome: string; ativo: boolean }

interface Props {
  tipo: 'tipos' | 'centro_custo'
  natureza?: FinanceiroNatureza
  label: string
}

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function FinanceiroCatalogoTab({ tipo, natureza, label }: Props) {
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = tipo === 'tipos'
      ? await listarFinanceiroTipos(natureza!)
      : await listarFinanceiroCentrosCusto()
    if (error) setErro(error)
    else { setItens(ordenarPorNome(data)); setErro(null) }
    setCarregando(false)
  }, [tipo, natureza])

  useEffect(() => { recarregar() }, [recarregar])

  async function handleCriar() {
    if (!novoNome.trim()) return
    setSalvandoNovo(true)
    const { error } = tipo === 'tipos'
      ? await criarFinanceiroTipo(natureza!, novoNome)
      : await criarFinanceiroCentroCusto(novoNome)
    if (error) setErro(error)
    else { setNovoNome(''); setErro(null); await recarregar() }
    setSalvandoNovo(false)
  }

  async function handleRenomear(id: string) {
    if (!nomeEditado.trim()) return
    const { error } = tipo === 'tipos'
      ? await renomearFinanceiroTipo(id, nomeEditado)
      : await renomearFinanceiroCentroCusto(id, nomeEditado)
    if (error) { setErro(error); return }
    setEditandoId(null)
    setErro(null)
    await recarregar()
  }

  async function handleAlternarAtivo(item: Item) {
    const { error } = tipo === 'tipos'
      ? await alternarAtivoFinanceiroTipo(item.id, !item.ativo)
      : await alternarAtivoFinanceiroCentroCusto(item.id, !item.ativo)
    if (error) { setErro(error); return }
    await recarregar()
  }

  async function handleExcluir(item: Item) {
    if (!confirm(`Excluir "${item.nome}"? Essa ação não pode ser desfeita.`)) return
    const { error } = tipo === 'tipos'
      ? await excluirFinanceiroTipo(item.id)
      : await excluirFinanceiroCentroCusto(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCriar()}
          placeholder={`Novo ${label}...`}
          className={inputCls + ' flex-1'}
        />
        <button
          onClick={handleCriar}
          disabled={salvandoNovo || !novoNome.trim()}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          + Criar
        </button>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          ⚠ {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-[var(--fg)]/40 text-sm">Nenhum {label} cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              {editandoId === item.id ? (
                <input
                  value={nomeEditado}
                  onChange={e => setNomeEditado(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRenomear(item.id)}
                  className={inputCls + ' flex-1'}
                  autoFocus
                />
              ) : (
                <span className={`flex-1 text-sm ${item.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                  {item.nome}
                </span>
              )}

              {editandoId === item.id ? (
                <button onClick={() => handleRenomear(item.id)} className="text-xs text-[var(--accent)] font-semibold">
                  Salvar
                </button>
              ) : (
                <button onClick={() => { setEditandoId(item.id); setNomeEditado(item.nome) }} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                  Renomear
                </button>
              )}

              <button onClick={() => handleAlternarAtivo(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                {item.ativo ? 'Desativar' : 'Ativar'}
              </button>

              <button onClick={() => handleExcluir(item)} className="text-xs text-red-400/70 hover:text-red-400">
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
