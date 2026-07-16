'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarTarefaAvulsa } from '@/lib/tarefas-avulsas'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  onClose: () => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function EventoAvulsoModal({ clienteId, setor, onClose }: Props) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSave() {
    if (!titulo.trim() || !data) { setErro('Título e data são obrigatórios.'); return }
    setSaving(true)
    setErro(null)
    await criarTarefaAvulsa({ clienteId, setor, titulo: titulo.trim(), descricao: descricao.trim() || null, data })
    setSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Novo evento</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Título *</label>
            <input className={inputCls} value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Descrição</label>
            <textarea className={inputCls} rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Data *</label>
            <input className={inputCls} type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !titulo.trim() || !data}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar evento'}
          </button>
        </div>
      </div>
    </div>
  )
}
