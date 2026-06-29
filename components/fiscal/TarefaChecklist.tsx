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
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<void>
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
  // optimisticDates: tipo → 'YYYY-MM-DD' (concluída) | null (pendente) | undefined (usar banco)
  const [optimisticDates, setOptimisticDates] = useState<Record<string, string | null>>({})
  const [unlockingTipo, setUnlockingTipo] = useState<string | null>(null)
  const [motivoMap, setMotivoMap] = useState<Record<string, string>>({})
  const [unlockPending, setUnlockPending] = useState(false)
  const [mit, setMit] = useState(mitInicial)

  const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupo(grupo)
  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tipos.length

  function getDataAtual(tipo: string): string {
    if (tipo in optimisticDates) return optimisticDates[tipo] ?? ''
    const t = mapaTarefa.get(tipo)
    if (!t?.concluida || !t.concluida_em) return ''
    return t.concluida_em.slice(0, 10) // YYYY-MM-DD
  }

  const concluidas = tipos.filter(t => getDataAtual(t) !== '').length

  const competencia = `${String(mes).padStart(2, '0')}/${ano}`

  function handleDateChange(tipo: string, valor: string) {
    if (valor) {
      // Aguarda ano completo (4 dígitos ≥ 1000) antes de salvar
      if (parseInt(valor.slice(0, 4), 10) < 1000) return
      setOptimisticDates(prev => ({ ...prev, [tipo]: valor }))
      startTransition(() => onToggle(tipo, true, valor))
    } else {
      // Apagou data → só abre unlock se já estava concluída
      const tarefa = mapaTarefa.get(tipo)
      if (tarefa?.concluida) {
        setUnlockingTipo(tipo)
      } else {
        setOptimisticDates(prev => ({ ...prev, [tipo]: null }))
      }
    }
  }

  async function handleUnlock(tipo: string) {
    const motivo = motivoMap[tipo]?.trim()
    if (!motivo) return
    const tarefa = mapaTarefa.get(tipo)
    if (!tarefa) return
    setUnlockPending(true)
    try {
      await desbloquearTarefa(tarefa.id, motivo, usuarioNome, clienteNome, tipo, competencia)
      setOptimisticDates(prev => ({ ...prev, [tipo]: null }))
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
          className="h-full bg-[#00CCEB] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tipos.map(tipo => {
          const dataAtual = getDataAtual(tipo)
          const feito = dataAtual !== ''
          const isUnlocking = unlockingTipo === tipo

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                feito
                  ? 'bg-[#00CCEB]/8 border-[#00CCEB]/25'
                  : 'bg-white/3 border-white/8'
              }`}>
                {/* Indicador de status */}
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[#00CCEB]' : 'bg-white/15'}`} />

                {/* Nome da tarefa */}
                <span className={`text-sm flex-1 transition-colors ${feito ? 'text-white/50 line-through' : 'text-white'}`}>
                  {tipo}
                </span>

                {/* Input de data */}
                <input
                  type="date"
                  value={dataAtual}
                  onChange={e => handleDateChange(tipo, e.target.value)}
                  disabled={isPending || isUnlocking}
                  className={`text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 ${
                    feito
                      ? 'bg-[#00CCEB]/10 border-[#00CCEB]/30 text-[#00CCEB] focus:border-[#00CCEB]/60'
                      : 'bg-white/5 border-white/10 text-white/60 focus:border-white/30 [color-scheme:dark]'
                  }`}
                  style={{ colorScheme: 'dark' }}
                />

                {/* Desbloquear */}
                {feito && (
                  <button
                    onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
                    className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded-lg border border-white/8 hover:border-white/20 transition-all whitespace-nowrap"
                  >
                    {isUnlocking ? 'Cancelar' : 'Desbloquear'}
                  </button>
                )}
              </div>

              {isUnlocking && (
                <div className="mt-1 ml-5 p-3 bg-white/3 border border-white/10 rounded-xl flex flex-col gap-2">
                  <p className="text-xs text-white/50">Informe o motivo para desbloquear esta tarefa:</p>
                  <textarea
                    value={motivoMap[tipo] ?? ''}
                    onChange={e => setMotivoMap(prev => ({ ...prev, [tipo]: e.target.value }))}
                    placeholder="Motivo obrigatório..."
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-[#00CCEB]/50"
                  />
                  <button
                    onClick={() => handleUnlock(tipo)}
                    disabled={!(motivoMap[tipo]?.trim()) || unlockPending}
                    className="self-end text-xs bg-[#00CCEB]/20 border border-[#00CCEB]/40 text-[#00CCEB] px-3 py-1.5 rounded-lg hover:bg-[#00CCEB]/30 transition-all disabled:opacity-40"
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
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00CCEB]/50 transition-colors"
          />
        </div>
      )}
    </div>
  )
}
