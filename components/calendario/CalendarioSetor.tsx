// components/calendario/CalendarioSetor.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { proximaOcorrencia, diasRestantes, alertaColor, alertaLabel } from '@/lib/calendario'
import CalendarioEventoModal from './CalendarioEventoModal'
import type { CalendarioEvento, UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  eventos: CalendarioEvento[]
  isAdmin: boolean
}

export default function CalendarioSetor({ setor, eventos, isAdmin }: Props) {
  const router = useRouter()
  const sb = createClient()

  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<CalendarioEvento | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const hoje = new Date()

  const cards = eventos
    .map(evento => {
      const alvo = proximaOcorrencia(evento, hoje)
      const dias = diasRestantes(alvo, hoje)
      return { evento, alvo, dias }
    })
    .sort((a, b) => a.dias - b.dias)

  async function handleExcluir(id: string) {
    setExcluindoId(id)
    await sb.from('calendario_eventos').delete().eq('id', id)
    setExcluindoId(null)
    setConfirmandoId(null)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Calendário</h1>
        {isAdmin && (
          <button onClick={() => setCriando(true)}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
            + Novo evento
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="text-[var(--fg)]/30 text-sm text-center py-12">Nenhum evento cadastrado ainda.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ evento, alvo, dias }) => {
            const lbl = alertaLabel(dias)
            const diaLabel = `${String(alvo.getDate()).padStart(2, '0')}/${String(alvo.getMonth() + 1).padStart(2, '0')}`
            return (
              <div key={evento.id} className={`rounded-xl border p-4 ${alertaColor(dias)}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[var(--fg)] font-semibold text-sm">{evento.titulo}</span>
                  <span className={`text-xs font-bold ${lbl.cls}`}>{lbl.text}</span>
                </div>
                <p className="text-[var(--fg)]/50 text-xs mb-1">Dia {diaLabel}</p>
                {evento.descricao && (
                  <p className="text-[var(--fg)]/40 text-xs leading-relaxed">{evento.descricao}</p>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--fg)]/8">
                    <button onClick={() => setEditando(evento)}
                      className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
                      Editar
                    </button>
                    {confirmandoId === evento.id ? (
                      <>
                        <button onClick={() => handleExcluir(evento.id)} disabled={excluindoId === evento.id}
                          className="text-xs bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
                          {excluindoId === evento.id ? 'Removendo...' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmandoId(null)}
                          className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-2 py-1.5">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmandoId(evento.id)}
                        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
                        Excluir
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {criando && (
        <CalendarioEventoModal setor={setor} evento={null} onClose={() => setCriando(false)} />
      )}
      {editando && (
        <CalendarioEventoModal setor={setor} evento={editando} onClose={() => setEditando(null)} />
      )}
    </div>
  )
}
