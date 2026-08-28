// app/admin/configuracoes/EntidadeListaTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import type { UserSetor } from '@/lib/types'
import {
  listarEntidades,
  criarEntidade,
  renomearEntidade,
  alternarAtivoEntidade,
  type TipoEntidade,
  type EntidadeConfig,
} from '@/lib/config-entidades-actions'
import { ordenarPorNome } from '@/lib/config-entidades'
import type { TipoEntidadeVinculo } from '@/lib/tarefa-tipo-vinculos-actions'
import VincularTarefasModal from './VincularTarefasModal'

interface Props {
  tabela: TipoEntidade
  entidadeTipoVinculo: TipoEntidadeVinculo
  setor: UserSetor
  label: string
}

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function EntidadeListaTab({ tabela, entidadeTipoVinculo, setor, label }: Props) {
  const [itens, setItens] = useState<EntidadeConfig[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')
  const [vinculandoItem, setVinculandoItem] = useState<EntidadeConfig | null>(null)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarEntidades(tabela, setor)
    if (error) setErro(error)
    else { setItens(ordenarPorNome(data)); setErro(null) }
    setCarregando(false)
  }, [tabela, setor])

  useEffect(() => { recarregar() }, [recarregar])

  async function handleCriar() {
    if (!novoNome.trim()) return
    setSalvandoNovo(true)
    const { error } = await criarEntidade(tabela, setor, novoNome)
    if (error) setErro(error)
    else { setNovoNome(''); setErro(null); await recarregar() }
    setSalvandoNovo(false)
  }

  async function handleRenomear(id: string) {
    if (!nomeEditado.trim()) return
    const { error } = await renomearEntidade(tabela, id, nomeEditado)
    if (error) { setErro(error); return }
    setEditandoId(null)
    setErro(null)
    await recarregar()
  }

  async function handleAlternarAtivo(item: EntidadeConfig) {
    const { error } = await alternarAtivoEntidade(tabela, item.id, !item.ativo)
    if (error) { setErro(error); return }
    await recarregar()
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCriar()}
          placeholder={`Novo ${label.toLowerCase()}...`}
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
        <p className="text-[var(--fg)]/40 text-sm">Nenhum {label.toLowerCase()} cadastrado ainda.</p>
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

              <button onClick={() => setVinculandoItem(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                Vincular tarefas
              </button>

              <button onClick={() => handleAlternarAtivo(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                {item.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {vinculandoItem && (
        <VincularTarefasModal
          entidadeTipo={entidadeTipoVinculo}
          entidadeId={vinculandoItem.id}
          entidadeNome={vinculandoItem.nome}
          setor={setor}
          onClose={() => setVinculandoItem(null)}
        />
      )}
    </div>
  )
}
