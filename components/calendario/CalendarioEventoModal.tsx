// components/calendario/CalendarioEventoModal.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CalendarioEvento, TipoDataEvento, UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  evento: CalendarioEvento | null
  onClose: () => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function CalendarioEventoModal({ setor, evento, onClose }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!evento

  const [titulo, setTitulo] = useState(evento?.titulo ?? '')
  const [descricao, setDescricao] = useState(evento?.descricao ?? '')
  const [tipoData, setTipoData] = useState<TipoDataEvento>(evento?.tipo_data ?? 'recorrente')
  const [diaMes, setDiaMes] = useState<number>(evento?.dia_mes ?? 1)
  const [data, setData] = useState(evento?.data ?? '')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSave() {
    if (!titulo.trim()) return
    if (tipoData === 'unica' && !data) { setErro('Selecione uma data.'); return }

    setSaving(true)
    setErro(null)

    const payload = {
      setor,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo_data: tipoData,
      dia_mes: tipoData === 'recorrente' ? diaMes : null,
      data: tipoData === 'unica' ? data : null,
    }

    const { error } = isEdit
      ? await sb.from('calendario_eventos').update(payload).eq('id', evento!.id)
      : await sb.from('calendario_eventos').insert(payload)

    if (error) { setSaving(false); setErro(error.message); return }

    setSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{isEdit ? 'Editar evento' : 'Novo evento'}</h2>
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
            <label className={labelCls}>Tipo de data</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTipoData('recorrente')}
                className={`flex-1 px-3 py-2.5 rounded-xl border text-sm transition-colors ${tipoData === 'recorrente' ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'}`}>
                Recorrente mensal
              </button>
              <button type="button" onClick={() => setTipoData('unica')}
                className={`flex-1 px-3 py-2.5 rounded-xl border text-sm transition-colors ${tipoData === 'unica' ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'}`}>
                Data única
              </button>
            </div>
          </div>

          {tipoData === 'recorrente' ? (
            <div>
              <label className={labelCls}>Dia do mês (1–31)</label>
              <input className={inputCls} type="number" min={1} max={31} value={diaMes}
                onChange={e => setDiaMes(Number(e.target.value))} />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Data</label>
              <input className={inputCls} type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          )}
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
          <button onClick={handleSave} disabled={saving || !titulo.trim()}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar evento'}
          </button>
        </div>
      </div>
    </div>
  )
}
