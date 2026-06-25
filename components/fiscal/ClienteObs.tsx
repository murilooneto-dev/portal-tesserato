'use client'

import { useState, useTransition } from 'react'
import { salvarObs } from '@/app/fiscal/clientes/actions'

interface Props {
  clienteId: string
  obsInicial: string
}

export default function ClienteObs({ clienteId, obsInicial }: Props) {
  const [obs, setObs] = useState(obsInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await salvarObs(clienteId, obs)
      setEditando(false)
    })
  }

  return (
    <div className="mt-6 pt-5 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Observação
        </label>
        {!editando && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-white/30 hover:text-white/70 px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
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
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setObs(obsInicial); setEditando(false) }}
              className="text-xs text-white/40 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={isPending}
              className="text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1.5 rounded-lg hover:bg-[#00B8D4]/30 transition-all disabled:opacity-50"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <p className={`text-sm ${obs ? 'text-yellow-400/80' : 'text-white/20'}`}>
          {obs || 'Nenhuma observação.'}
        </p>
      )}
    </div>
  )
}
