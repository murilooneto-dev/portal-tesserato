'use client'

import { useState } from 'react'
import { renomearSecaoParcelamento, removerSecaoParcelamento } from '@/lib/parcelamento-secoes-actions'

interface SecaoParcelamento {
  id: string
  nome: string
}

interface Props {
  secoes: SecaoParcelamento[]
  onClose: () => void
  onChanged: () => void
}

export default function GerenciarSecoesModal({ secoes, onClose, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function startEdit(s: SecaoParcelamento) {
    setEditingId(s.id)
    setEditValue(s.nome)
    setErro(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setErro(null)
  }

  async function salvarEdicao(s: SecaoParcelamento) {
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await renomearSecaoParcelamento(s.id, s.nome, editValue)
      if (error) { setErro(error); return }
      setEditingId(null)
      setEditValue('')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function remover(s: SecaoParcelamento) {
    if (!confirm(`Remover a seção "${s.nome}"?`)) return
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await removerSecaoParcelamento(s.id, s.nome)
      if (error) { setErro(error); return }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Gerenciar seções</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-2">
          {erro && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-2">
              ⚠ {erro}
            </div>
          )}

          {secoes.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
              {editingId === s.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent)]/50 text-[var(--fg)] text-sm focus:outline-none"
                  />
                  <button onClick={() => salvarEdicao(s)} disabled={busyId === s.id || !editValue.trim()}
                    className="text-xs font-semibold text-[var(--accent)] hover:opacity-80 disabled:opacity-40 transition-opacity px-2 py-1">
                    Salvar
                  </button>
                  <button onClick={cancelEdit} disabled={busyId === s.id}
                    className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] transition-colors px-2 py-1">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[var(--fg)]">{s.nome}</span>
                  <button onClick={() => startEdit(s)} disabled={busyId !== null}
                    className="text-xs font-semibold text-[var(--fg)]/50 hover:text-[var(--fg)] transition-colors px-2 py-1">
                    Editar
                  </button>
                  <button onClick={() => remover(s)} disabled={busyId !== null}
                    className="text-xs font-semibold text-[var(--fg)]/50 hover:text-red-400 transition-colors px-2 py-1">
                    {busyId === s.id ? '...' : 'Remover'}
                  </button>
                </>
              )}
            </div>
          ))}

          {secoes.length === 0 && (
            <p className="text-center text-[var(--fg)]/20 text-sm py-8">Nenhuma seção cadastrada.</p>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
