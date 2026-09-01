'use client'

import Link from 'next/link'
import { Fragment, useState, useTransition } from 'react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { isoParaDisplay, displayParaIso, autoFormatarData } from '@/lib/data-checklist'
import { desbloquearTarefa, marcarSemMovimento } from '@/app/fiscal/clientes/actions'
import type { StatusFiltroMinhasTarefas } from './MinhasTarefasFiltro'

interface Props {
  tipo: string
  tipoResposta: TipoResposta
  etapasDefinidas: string[] | null
  clientes: { id: string; nome: string }[]
  tarefas: Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  usuarioNome: string
  busca: string
  statusFiltro: StatusFiltroMinhasTarefas
  onToggle: (clienteId: string, tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
}

const inputCls = (feito: boolean) => `text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none w-[106px] text-center ${
  feito
    ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
    : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
}`

export default function MinhasTarefasSecao({
  tipo,
  tipoResposta,
  etapasDefinidas,
  clientes,
  tarefas,
  etapas,
  mes,
  ano,
  usuarioNome,
  busca,
  statusFiltro,
  onToggle,
  onAtualizarEtapa,
}: Props) {
  const [, startTransition] = useTransition()
  const [overlay, setOverlay] = useState<Record<string, string | null>>({})
  const [localText, setLocalText] = useState<Record<string, string>>({})
  const [optimisticSemMovimento, setOptimisticSemMovimento] = useState<Record<string, boolean>>({})
  const [unlockingCliente, setUnlockingCliente] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [unlockPending, setUnlockPending] = useState(false)

  const competencia = `${String(mes).padStart(2, '0')}/${ano}`

  const mapaTarefa = new Map(tarefas.map(t => [t.cliente_id, t]))
  const concluidas = clientes.filter(c => getSavedIso(c.id, null) !== '').length

  function chave(clienteId: string, etapaNome: string | null) {
    return etapaNome ? `${clienteId}::${etapaNome}` : clienteId
  }

  function getSavedIso(clienteId: string, etapaNome: string | null): string {
    const key = chave(clienteId, etapaNome)
    if (key in overlay) return overlay[key] ?? ''
    if (etapaNome) {
      const tarefaId = mapaTarefa.get(clienteId)?.id
      const e = etapas.find(e => e.tarefa_id === tarefaId && e.nome === etapaNome)
      return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : ''
    }
    const t = mapaTarefa.get(clienteId)
    return t?.concluida && t.concluida_em ? t.concluida_em.slice(0, 10) : ''
  }

  function getDisplayValue(clienteId: string, etapaNome: string | null): string {
    const key = chave(clienteId, etapaNome)
    if (key in localText) return localText[key]
    return isoParaDisplay(getSavedIso(clienteId, etapaNome))
  }

  function handleChange(clienteId: string, etapaNome: string | null, raw: string) {
    const key = chave(clienteId, etapaNome)
    const formatted = autoFormatarData(raw)
    setLocalText(prev => ({ ...prev, [key]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setOverlay(prev => ({ ...prev, [key]: iso }))
      setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(clienteId, tipo, etapaNome, true, iso)
        else onToggle(clienteId, tipo, true, iso)
      })
    }
  }

  function handleBlur(clienteId: string, etapaNome: string | null) {
    const key = chave(clienteId, etapaNome)
    const val = localText[key]
    if (val === undefined) return
    if (val === '') {
      // Só o tipo sem etapas nomeadas tem a cerimônia de desbloqueio
      // (motivo obrigatório) — mesma regra de TarefaChecklist.tsx. Etapas
      // nomeadas (ex: ENTRADA/SAIDAS) sempre puderam ser limpas direto.
      const tarefa = etapaNome ? undefined : mapaTarefa.get(clienteId)
      if (!etapaNome && tarefa?.concluida) {
        setUnlockingCliente(clienteId)
      } else {
        setOverlay(prev => ({ ...prev, [key]: null }))
        startTransition(() => {
          if (etapaNome) onAtualizarEtapa(clienteId, tipo, etapaNome, false)
          else onToggle(clienteId, tipo, false)
        })
      }
    }
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function getSemMovimento(clienteId: string): boolean {
    if (clienteId in optimisticSemMovimento) return optimisticSemMovimento[clienteId]
    return !!mapaTarefa.get(clienteId)?.sem_movimento
  }

  function handleToggleSemMovimento(clienteId: string) {
    const novo = !getSemMovimento(clienteId)
    setOptimisticSemMovimento(prev => ({ ...prev, [clienteId]: novo }))
    setOverlay(prev => ({ ...prev, [chave(clienteId, null)]: novo ? new Date().toISOString().slice(0, 10) : null }))
    startTransition(() => { marcarSemMovimento(clienteId, tipo, mes, ano, novo) })
  }

  function statusBate(clienteId: string): boolean {
    if (statusFiltro === 'TODOS') return true
    if (statusFiltro === 'SEM_MOVIMENTO') return getSemMovimento(clienteId)
    const concluida = !!mapaTarefa.get(clienteId)?.concluida
    if (statusFiltro === 'CONCLUIDA') return concluida && !getSemMovimento(clienteId)
    return !concluida // PENDENTE
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) && statusBate(c.id)
  )

  async function handleUnlock(clienteId: string, clienteNome: string) {
    const motivoTrim = motivo.trim()
    if (!motivoTrim) return
    const tarefa = mapaTarefa.get(clienteId)
    if (!tarefa) return
    setUnlockPending(true)
    try {
      await desbloquearTarefa(tarefa.id, motivoTrim, usuarioNome, clienteNome, tipo, competencia)
      setOverlay(prev => ({ ...prev, [chave(clienteId, null)]: null }))
      setUnlockingCliente(null)
      setMotivo('')
    } finally {
      setUnlockPending(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--fg)] uppercase tracking-widest">{tipo}</h2>
        {!etapasDefinidas && tipoResposta === 'data' && (
          <span className="text-xs text-[var(--fg)]/40">{concluidas}/{clientes.length}</span>
        )}
      </div>

      {clientes.length === 0 ? (
        <p className="text-sm text-[var(--fg)]/40">Nenhum cliente com essa tarefa aplicável.</p>
      ) : tipoResposta !== 'data' ? (
        <p className="text-sm text-[var(--fg)]/40">
          Esse tipo não é de data/etapas — edite pela ficha de cada cliente.
        </p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="text-sm text-[var(--fg)]/40">Nenhum cliente encontrado com esse filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--fg)]/10">
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Empresa</th>
                {(etapasDefinidas ?? ['—']).map(col => (
                  <th key={col} className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium whitespace-nowrap">
                    {etapasDefinidas ? col : 'Data'}
                  </th>
                ))}
                <th className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium whitespace-nowrap">Sem mov.</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map(cliente => {
                const semMovimentoAtivo = getSemMovimento(cliente.id)
                return (
                <Fragment key={cliente.id}>
                  <tr className="border-b border-[var(--fg)]/5">
                    <td className="py-2 px-3 text-[var(--fg)]">
                      <Link href={`/fiscal/clientes/${cliente.id}`} className="hover:underline">
                        {cliente.nome}
                      </Link>
                    </td>
                    {semMovimentoAtivo ? (
                      <td colSpan={(etapasDefinidas ?? [null]).length} className="text-center py-2 px-3">
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/60 whitespace-nowrap">
                          SEM MOVIMENTO
                        </span>
                      </td>
                    ) : (etapasDefinidas ?? [null]).map(etapaNome => {
                      const iso = getSavedIso(cliente.id, etapaNome)
                      return (
                        <td key={etapaNome ?? '_'} className="text-center py-2 px-3">
                          <input
                            type="text"
                            value={getDisplayValue(cliente.id, etapaNome)}
                            onChange={e => handleChange(cliente.id, etapaNome, e.target.value)}
                            onBlur={() => handleBlur(cliente.id, etapaNome)}
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                            className={inputCls(iso !== '')}
                          />
                        </td>
                      )
                    })}
                    <td className="text-center py-2 px-3">
                      <input
                        type="checkbox"
                        checked={semMovimentoAtivo}
                        onChange={() => handleToggleSemMovimento(cliente.id)}
                        className="w-3.5 h-3.5 accent-[var(--fg)]/50 cursor-pointer"
                      />
                    </td>
                  </tr>
                  {!etapasDefinidas && unlockingCliente === cliente.id && (
                    <tr className="border-b border-[var(--fg)]/5">
                      <td colSpan={3} className="px-3 pb-3">
                        <div className="p-3 bg-[var(--fg)]/3 border border-[var(--fg)]/10 rounded-xl flex flex-col gap-2">
                          <p className="text-xs text-[var(--fg)]/50">Informe o motivo para desbloquear esta tarefa:</p>
                          <textarea
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                            placeholder="Motivo obrigatório..."
                            rows={2}
                            className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)] placeholder-[var(--fg)]/20 resize-none focus:outline-none focus:border-[var(--accent)]/50"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setUnlockingCliente(null); setMotivo('') }}
                              className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-3 py-1.5"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleUnlock(cliente.id, cliente.nome)}
                              disabled={!motivo.trim() || unlockPending}
                              className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded-lg hover:bg-[var(--accent)]/30 transition-all disabled:opacity-40"
                            >
                              {unlockPending ? 'Aguarde...' : 'Confirmar desbloqueio'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
