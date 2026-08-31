'use client'

import { useMemo, useState, useTransition } from 'react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { STATUS_DOSSIE_OPCOES, type StatusDossie } from '@/lib/status-dossie'

interface ClienteDossie {
  id: string
  nome: string
  cnpj: string | null
  dossieStatus: StatusDossie
  dossieFinalizado: boolean
}

interface Props {
  clientes: ClienteDossie[]
  onAtualizarStatus: (clienteId: string, status: StatusDossie) => Promise<{ error: string | null }>
  onAtualizarFinalizado: (clienteId: string, finalizado: boolean) => Promise<{ error: string | null }>
}

const inputCls = "flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const selectCls = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50"

export default function DossieSecao({ clientes, onAtualizarStatus, onAtualizarFinalizado }: Props) {
  const [busca, setBusca] = useFiltroPersistente('dossie:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<'TODOS' | StatusDossie>('dossie:status', 'TODOS')
  const [, startTransition] = useTransition()
  const [overlay, setOverlay] = useState<Record<string, { status?: StatusDossie; finalizado?: boolean }>>({})

  function getStatus(cliente: ClienteDossie): StatusDossie {
    return overlay[cliente.id]?.status ?? cliente.dossieStatus
  }

  function getFinalizado(cliente: ClienteDossie): boolean {
    return overlay[cliente.id]?.finalizado ?? cliente.dossieFinalizado
  }

  function handleStatusChange(clienteId: string, status: StatusDossie) {
    setOverlay(prev => ({ ...prev, [clienteId]: { ...prev[clienteId], status } }))
    startTransition(() => { onAtualizarStatus(clienteId, status) })
  }

  function handleFinalizadoChange(clienteId: string, finalizado: boolean) {
    setOverlay(prev => ({ ...prev, [clienteId]: { ...prev[clienteId], finalizado } }))
    startTransition(() => { onAtualizarFinalizado(clienteId, finalizado) })
  }

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (statusFiltro !== 'TODOS' && getStatus(c) !== statusFiltro) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clientes, busca, statusFiltro, overlay])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por nome do cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className={inputCls}
        />
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as 'TODOS' | StatusDossie)} className={selectCls}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todos os status</option>
          {STATUS_DOSSIE_OPCOES.map(s => <option key={s.valor} value={s.valor} className="bg-[var(--bg-surface)]">{s.label}</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--fg)]/10">
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Empresa</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">CNPJ</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Status</th>
                <th className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium">Finalizado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(cliente => {
                const finalizado = getFinalizado(cliente)
                return (
                  <tr key={cliente.id} className="border-b border-[var(--fg)]/5">
                    <td className="py-2 px-3 text-[var(--fg)]">{cliente.nome}</td>
                    <td className="py-2 px-3 text-[var(--fg)]/60 font-mono text-xs">{cliente.cnpj ?? '—'}</td>
                    <td className="py-2 px-3">
                      <select
                        value={getStatus(cliente)}
                        onChange={e => handleStatusChange(cliente.id, e.target.value as StatusDossie)}
                        disabled={finalizado}
                        className={selectCls}
                      >
                        {STATUS_DOSSIE_OPCOES.map(s => <option key={s.valor} value={s.valor} className="bg-[var(--bg-surface)]">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="text-center py-2 px-3">
                      <input
                        type="checkbox"
                        checked={finalizado}
                        onChange={e => handleFinalizadoChange(cliente.id, e.target.checked)}
                        className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
