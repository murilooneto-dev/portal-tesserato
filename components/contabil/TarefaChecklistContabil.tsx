'use client'

import { useTransition, useState } from 'react'
import type { Tarefa, TarefaEtapa } from '@/lib/types'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  tarefasPersonalizadas: string[]
  tarefaTipos: Record<string, string[] | null>
  tarefas: Tarefa[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  onToggleSimples: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
  podeEditar: boolean
}

function isoParaDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayParaIso(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (parseInt(y, 10) < 1000) return null
  const iso = `${y}-${m}-${d}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return iso
}

function autoFormatarData(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return digits
}

export default function TarefaChecklistContabil({
  tarefasPersonalizadas,
  tarefaTipos,
  tarefas,
  etapas,
  mes,
  ano,
  onToggleSimples,
  onAtualizarEtapa,
  podeEditar,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [localText, setLocalText] = useState<Record<string, string>>({})

  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tarefasPersonalizadas.length
  const concluidas = tarefasPersonalizadas.filter(t => mapaTarefa.get(t)?.concluida).length

  function etapasDaTarefa(tipo: string): TarefaEtapa[] {
    const tarefaId = mapaTarefa.get(tipo)?.id
    if (!tarefaId) return []
    return etapas.filter(e => e.tarefa_id === tarefaId)
  }

  function keyLocal(tipo: string, etapaNome?: string) {
    return etapaNome ? `${tipo}::${etapaNome}` : tipo
  }

  function getSavedIso(tipo: string, etapaNome?: string): string {
    if (etapaNome) {
      const e = etapasDaTarefa(tipo).find(e => e.nome === etapaNome)
      return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : ''
    }
    const t = mapaTarefa.get(tipo)
    return t?.concluida && t.concluida_em ? t.concluida_em.slice(0, 10) : ''
  }

  function getDisplayValue(tipo: string, etapaNome?: string): string {
    const key = keyLocal(tipo, etapaNome)
    if (key in localText) return localText[key]
    return isoParaDisplay(getSavedIso(tipo, etapaNome))
  }

  function handleTextChange(tipo: string, raw: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const formatted = autoFormatarData(raw)
    setLocalText(prev => ({ ...prev, [key]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, true, iso)
        else onToggleSimples(tipo, true, iso)
      })
    }
  }

  function handleTextBlur(tipo: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const val = localText[key]
    if (val === undefined) return
    if (val === '') {
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, false)
        else onToggleSimples(tipo, false)
      })
    }
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const inputCls = (feito: boolean) => `text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
    feito
      ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
      : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
  }`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
          Tarefas — {MESES[mes - 1]}/{ano}
        </h3>
        <span className="text-xs text-[var(--fg)]/40">{concluidas}/{total}</span>
      </div>

      <div className="w-full h-1.5 bg-[var(--fg)]/8 rounded-full mb-5">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tarefasPersonalizadas.map(tipo => {
          const etapasDefinidas = tarefaTipos[tipo] ?? null
          const feito = !!mapaTarefa.get(tipo)?.concluida
          const displayVal = getDisplayValue(tipo)

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                feito ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/15'}`} />
                <span className={`text-sm flex-1 transition-colors ${feito ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>
                  {tipo}
                </span>

                {!etapasDefinidas && (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={inputCls(feito)}
                  />
                )}
              </div>

              {etapasDefinidas && (
                <div className="ml-5 mt-1 grid grid-cols-2 gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                  {etapasDefinidas.map(etapaNome => {
                    const etapaFeita = !!etapasDaTarefa(tipo).find(e => e.nome === etapaNome)?.concluida
                    const etapaDisplay = getDisplayValue(tipo, etapaNome)
                    return (
                      <div key={etapaNome} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--fg)]/60">{etapaNome}</span>
                        <input
                          type="text"
                          value={etapaDisplay}
                          onChange={e => handleTextChange(tipo, e.target.value, etapaNome)}
                          onBlur={() => handleTextBlur(tipo, etapaNome)}
                          disabled={!podeEditar || isPending}
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                          className={inputCls(etapaFeita)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
