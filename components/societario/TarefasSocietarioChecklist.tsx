'use client'

import { useState, useTransition } from 'react'
import type { TarefaEtapa } from '@/lib/types'
import type { TarefaSocietarioAplicavel } from '@/app/societario/clientes/tarefas-actions'

interface Props {
  tarefas: TarefaSocietarioAplicavel[]
  etapas: TarefaEtapa[]
  podeEditar: boolean
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<{ error: string | null } | void>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<{ error: string | null } | void>
  onSalvarTexto: (tipo: string, texto: string) => Promise<{ error: string | null } | void>
}

const inputCls = (feito: boolean) => `text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
  feito
    ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
    : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
}`

function formatarDdMm(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function parseDdMmParaIso(valor: string): string | undefined {
  const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  return `${m[3]}-${m[2]}-${m[1]}`
}

export default function TarefasSocietarioChecklist({
  tarefas, etapas, podeEditar, onToggle, onAtualizarEtapa, onSalvarTexto,
}: Props) {
  const [, startTransition] = useTransition()
  const [textoDraft, setTextoDraft] = useState<Record<string, string>>({})
  const [dataDraft, setDataDraft] = useState<Record<string, string>>({})
  const [etapaDraft, setEtapaDraft] = useState<Record<string, string>>({})

  function etapasDaTarefa(tarefaId: string | undefined) {
    if (!tarefaId) return []
    return etapas.filter(e => e.tarefa_id === tarefaId)
  }

  if (tarefas.length === 0) {
    return (
      <p className="text-[var(--fg)]/25 text-sm py-4">
        Nenhuma tarefa cadastrada para este cliente no período atual.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {tarefas.map(t => {
        const feito = t.tarefa?.concluida ?? false
        const chaveData = dataDraft[t.nome] ?? formatarDdMm(t.tarefa?.concluida_em ?? null)
        const chaveTexto = textoDraft[t.nome] ?? t.tarefa?.resposta_texto ?? ''

        return (
          <div key={t.tarefaTipoId}>
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
              feito ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/15'}`} />
              <span className={`text-sm flex-1 transition-colors ${feito ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>
                {t.nome}
              </span>

              {t.tipoResposta === 'data' && !t.etapas && (
                <input
                  type="text"
                  value={chaveData}
                  onChange={e => setDataDraft(prev => ({ ...prev, [t.nome]: e.target.value }))}
                  onBlur={() => {
                    const iso = parseDdMmParaIso(chaveData)
                    startTransition(() => { onToggle(t.nome, chaveData.trim() !== '', iso) })
                  }}
                  disabled={!podeEditar}
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                  className={inputCls(feito)}
                />
              )}
            </div>

            {t.etapas && t.etapas.length > 0 && (
              <div className="ml-5 mt-1 grid grid-cols-2 gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                {t.etapas.map(etapaNome => {
                  const etapaAtual = etapasDaTarefa(t.tarefa?.id)?.find(e => e.nome === etapaNome)
                  const etapaFeita = !!etapaAtual?.concluida
                  const chave = `${t.nome}::${etapaNome}`
                  const valor = etapaDraft[chave] ?? formatarDdMm(etapaAtual?.concluida_em ?? null)
                  return (
                    <div key={etapaNome} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--fg)]/60">{etapaNome}</span>
                      <input
                        type="text"
                        value={valor}
                        onChange={e => setEtapaDraft(prev => ({ ...prev, [chave]: e.target.value }))}
                        onBlur={() => {
                          const iso = parseDdMmParaIso(valor)
                          startTransition(() => { onAtualizarEtapa(t.nome, etapaNome, valor.trim() !== '', iso) })
                        }}
                        disabled={!podeEditar}
                        placeholder="DD/MM/AAAA"
                        maxLength={10}
                        className={inputCls(etapaFeita)}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {t.tipoResposta === 'texto' && (
              <div className="ml-5 mt-1 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                <textarea
                  value={chaveTexto}
                  onChange={e => setTextoDraft(prev => ({ ...prev, [t.nome]: e.target.value }))}
                  onBlur={() => startTransition(() => { onSalvarTexto(t.nome, chaveTexto) })}
                  disabled={!podeEditar}
                  placeholder="Digite a resposta..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50 disabled:opacity-40"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
