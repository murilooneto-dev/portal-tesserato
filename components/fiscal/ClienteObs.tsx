'use client'

import { useState, useTransition } from 'react'
import { salvarObs } from '@/app/fiscal/clientes/actions'

interface Props {
  clienteId: string
  obsInicial: string
  mes: number
  ano: number
  podeEditar: boolean
}

export default function ClienteObs({ clienteId, obsInicial, mes, ano, podeEditar }: Props) {
  const [obs, setObs] = useState(obsInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await salvarObs(clienteId, mes, ano, obs)
      setEditando(false)
    })
  }

  return (
    <div className="mt-6 pt-5 border-t border-[var(--fg)]/8">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
          Observação
        </label>
        {!editando && podeEditar && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/70 px-2 py-1 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all"
          >
            ✏ Editar
          </button>
        )}
      </div>

      {editando ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={3}
            placeholder="Observações sobre este cliente..."
            className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-xl px-4 py-2.5 text-sm text-[var(--fg)] placeholder-[var(--fg)]/20 resize-none focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setObs(obsInicial); setEditando(false) }}
              className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={isPending}
              className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded-lg hover:bg-[var(--accent)]/30 transition-all disabled:opacity-50"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <p className={`text-sm ${obs ? 'text-yellow-400/80' : 'text-[var(--fg)]/20'}`}>
          {obs || 'Nenhuma observação.'}
        </p>
      )}
    </div>
  )
}
