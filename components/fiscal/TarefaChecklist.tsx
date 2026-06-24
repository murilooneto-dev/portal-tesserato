'use client'

import { useTransition } from 'react'
import type { Tarefa } from '@/lib/types'

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
  grupo: string
  tarefas: Tarefa[]
  mes: number
  ano: number
  usuarioId: string
  onToggle: (tipo: string, concluida: boolean) => Promise<void>
}

export default function TarefaChecklist({ grupo, tarefas, mes, ano, onToggle }: Props) {
  const [isPending, startTransition] = useTransition()
  const tipos = getTiposParaGrupo(grupo)

  const mapaConc = new Map(tarefas.map(t => [t.tipo, t.concluida]))
  const total = tipos.length
  const concluidas = tipos.filter(t => mapaConc.get(t)).length

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
          const feito = mapaConc.get(tipo) ?? false
          return (
            <button
              key={tipo}
              onClick={() => startTransition(() => onToggle(tipo, !feito))}
              disabled={isPending}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                feito
                  ? 'bg-[#00B8D4]/10 border-[#00B8D4]/30'
                  : 'bg-white/3 border-white/8 hover:bg-white/6'
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                feito ? 'bg-[#00B8D4] border-[#00B8D4]' : 'border-white/20'
              }`}>
                {feito && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm transition-colors ${feito ? 'text-white/50 line-through' : 'text-white'}`}>
                {tipo}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
