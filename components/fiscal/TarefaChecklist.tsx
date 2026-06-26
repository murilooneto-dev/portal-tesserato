'use client'

import { useTransition, useState } from 'react'
import type { Tarefa } from '@/lib/types'
import { desbloquearTarefa, salvarMIT } from '@/app/fiscal/clientes/actions'

const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
const TAREFAS_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
const TAREFAS_MEI     = ['DAS']

function getTiposParaGrupo(grupo: string) {
  if (grupo === 'simples') return TAREFAS_SIMPLES
  if (grupo === 'mei')     return TAREFAS_MEI
  return TAREFAS_NORMAL
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  clienteId: string
  clienteNome: string
  grupo: string
  tarefasPersonalizadas?: string[]
  tarefas: Tarefa[]
  mes: number
  ano: number
  usuarioId: string
  usuarioNome: string
  mitInicial?: string
  onToggle: (tipo: string, concluida: boolean) => Promise<void>
  onOptimisticUnlock?: (tipo: string) => void
}

export default function TarefaChecklist({
  clienteId,
  clienteNome,
  grupo,
  tarefasPersonalizadas = [],
  tarefas,
  mes,
  ano,
  usuarioNome,
  mitInicial = '',
  onToggle,
  onOptimisticUnlock,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [unlockingTipo, setUnlockingTipo] = useState<string | null>(null)
  const [motivoMap, setMotivoMap] = useState<Record<string, string>>({})
  const [unlockPending, setUnlockPending] = useState(false)
  const [mit, setMit] = useState(mitInicial)

  const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupo(grupo)
  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tipos.length
  const concluidas = tipos.filter(t => (t in optimistic ? optimistic[t] : mapaTarefa.get(t)?.concluida)).length

  const competencia = `${String(mes).padStart(2, '0')}/${ano}`

  async function handleUnlock(tipo: string) {
    const motivo = motivoMap[tipo]?.trim()
    if (!motivo) return

    const tarefa = mapaTarefa.get(tipo)
    if (!tarefa) return

    setUnlockPending(true)
    try {
      await desbloquearTarefa(tarefa.id, motivo, usuarioNome, clienteNome, tipo, competencia)
      setOptimistic(prev => { const n = { ...prev }; delete n[tipo]; return n })
      onOptimisticUnlock?.(tipo)
      setUnlockingTipo(null)
      setMotivoMap(prev => { const n = { ...prev }; delete n[tipo]; return n })
    } finally {
      setUnlockPending(false)
    }
  }

  async function handleMITBlur() {
    await salvarMIT(clienteId, mit)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Tarefas — {MESES[mes - 1]}/{ano}
        </h3>
        <span className="text-xs text-white/40">{concluidas}/{total}</span>
      </div>

      <div className="w-full h-1.5 bg-white/8 rounded-full mb-5">
        <div
          className="h-full bg-[#00B8D4] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tipos.map(tipo => {
          const tarefa = mapaTarefa.get(tipo)
          const feitoReal = tarefa?.concluida ?? false
          const feito = tipo in optimistic ? optimistic[tipo] : feitoReal
          const isUnlocking = unlockingTipo === tipo

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (feito) return // locked — use unlock flow
                    setOptimistic(prev => ({ ...prev, [tipo]: true }))
                    startTransition(() => onToggle(tipo, true))
                  }}
                  disabled={isPending || feito}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                    feito
                      ? 'bg-[#00B8D4]/10 border-[#00B8D4]/30 cursor-default'
                      : 'bg-white/3 border-white/8 hover:bg-white/6'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    feito ? 'bg-[#00B8D4] border-[#00B8D4]' : 'border-white/20'
                  }`}>
                    {feito ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </div>
                  <span className={`text-sm flex-1 transition-colors ${feito ? 'text-white/50 line-through' : 'text-white'}`}>
                    {tipo}
                  </span>
                  {feito && (
                    <svg className="w-4 h-4 text-[#00B8D4]/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </button>

                {feito && (
                  <button
                    onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
                    className="text-xs text-white/40 hover:text-white/70 px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all whitespace-nowrap"
                  >
                    {isUnlocking ? 'Cancelar' : 'Desbloquear'}
                  </button>
                )}
              </div>

              {isUnlocking && (
                <div className="mt-1 ml-8 p-3 bg-white/3 border border-white/10 rounded-xl flex flex-col gap-2">
                  <p className="text-xs text-white/50">Informe o motivo para desbloquear esta tarefa:</p>
                  <textarea
                    value={motivoMap[tipo] ?? ''}
                    onChange={e => setMotivoMap(prev => ({ ...prev, [tipo]: e.target.value }))}
                    placeholder="Motivo obrigatório..."
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-[#00B8D4]/50"
                  />
                  <button
                    onClick={() => handleUnlock(tipo)}
                    disabled={!(motivoMap[tipo]?.trim()) || unlockPending}
                    className="self-end text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1.5 rounded-lg hover:bg-[#00B8D4]/30 transition-all disabled:opacity-40"
                  >
                    {unlockPending ? 'Aguarde...' : 'Confirmar desbloqueio'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {grupo === 'normal' && (
        <div className="mt-6 pt-5 border-t border-white/8">
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
            MIT
          </label>
          <input
            type="text"
            value={mit}
            onChange={e => setMit(e.target.value)}
            onBlur={handleMITBlur}
            placeholder="Anotação MIT..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
          />
        </div>
      )}
    </div>
  )
}
