'use client'

import { useState, useTransition } from 'react'
import { toggleTarefaAvulsa, excluirTarefaAvulsa, type TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import EventoAvulsoModal from './EventoAvulsoModal'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function EventosAvulsosSecao({ clienteId, setor, eventos, podeEditar }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle(id: string, concluida: boolean) {
    startTransition(() => { toggleTarefaAvulsa(id, clienteId, setor, concluida) })
  }

  function handleExcluir(id: string) {
    startTransition(() => { excluirTarefaAvulsa(id, clienteId, setor) })
    setExcluindoId(null)
  }

  return (
    <div className="mt-8 pt-6 border-t border-[var(--fg)]/8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">Eventos do mês</h3>
        {podeEditar && (
          <button onClick={() => setModalAberto(true)}
            className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 px-3 py-1.5 rounded-lg transition-all font-semibold">
            + Evento
          </button>
        )}
      </div>

      {eventos.length === 0 ? (
        <p className="text-[var(--fg)]/25 text-xs py-2">Nenhum evento avulso neste mês.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {eventos.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
              ev.concluida ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
            }`}>
              <button onClick={() => handleToggle(ev.id, !ev.concluida)} disabled={!podeEditar || isPending}
                className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 transition-colors disabled:opacity-40 ${
                  ev.concluida ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--fg)]/25'
                }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${ev.concluida ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>{ev.titulo}</p>
                {ev.descricao && <p className="text-xs text-[var(--fg)]/40 mt-0.5">{ev.descricao}</p>}
                <p className="text-[10px] text-[var(--fg)]/25 mt-1">
                  {formatarData(ev.data)} · criado por {ev.criado_por_nome ?? 'desconhecido'}
                </p>
              </div>
              {podeEditar && (
                excluindoId === ev.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleExcluir(ev.id)}
                      className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-1 rounded-md">Confirmar</button>
                    <button onClick={() => setExcluindoId(null)}
                      className="text-[10px] text-[var(--fg)]/40 px-1">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setExcluindoId(ev.id)}
                    className="text-[var(--fg)]/25 hover:text-red-400 text-xs shrink-0 transition-colors">×</button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <EventoAvulsoModal clienteId={clienteId} setor={setor} onClose={() => setModalAberto(false)} />
      )}
    </div>
  )
}
