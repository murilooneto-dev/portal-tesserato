'use client'

import { useMemo } from 'react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import MinhasTarefasSecao from './MinhasTarefasSecao'

export type StatusFiltroMinhasTarefas = 'TODOS' | 'PENDENTE' | 'CONCLUIDA' | 'SEM_MOVIMENTO'

const LABEL_STATUS: Record<StatusFiltroMinhasTarefas, string> = {
  TODOS: 'Todos os status',
  PENDENTE: 'Pendente',
  CONCLUIDA: 'Concluída',
  SEM_MOVIMENTO: 'Sem Movimento',
}

interface Secao {
  tipo: string
  tipoResposta: TipoResposta
  etapasDefinidas: string[] | null
  clientes: { id: string; nome: string }[]
  tarefas: Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
}

interface Props {
  secoes: Secao[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  usuarioNome: string
  onToggle: (clienteId: string, tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
}

const inputCls = "flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const selectCls = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function MinhasTarefasFiltro({ secoes, etapas, mes, ano, usuarioNome, onToggle, onAtualizarEtapa }: Props) {
  const [busca, setBusca] = useFiltroPersistente('minhas-tarefas:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<StatusFiltroMinhasTarefas>('minhas-tarefas:status', 'TODOS')
  const [tarefaFiltro, setTarefaFiltro] = useFiltroPersistente('minhas-tarefas:tarefa', 'TODAS')

  const secoesFiltradas = useMemo(
    () => secoes.filter(s => tarefaFiltro === 'TODAS' || s.tipo === tarefaFiltro),
    [secoes, tarefaFiltro],
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Buscar por nome do cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className={inputCls}
        />
        <select value={tarefaFiltro} onChange={e => setTarefaFiltro(e.target.value)} className={selectCls}>
          <option value="TODAS" className="bg-[var(--bg-surface)]">Todas as tarefas</option>
          {secoes.map(s => (
            <option key={s.tipo} value={s.tipo} className="bg-[var(--bg-surface)]">{s.tipo}</option>
          ))}
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as StatusFiltroMinhasTarefas)} className={selectCls}>
          {(Object.keys(LABEL_STATUS) as StatusFiltroMinhasTarefas[]).map(s => (
            <option key={s} value={s} className="bg-[var(--bg-surface)]">{LABEL_STATUS[s]}</option>
          ))}
        </select>
      </div>

      {secoesFiltradas.map(secao => (
        <MinhasTarefasSecao
          key={secao.tipo}
          tipo={secao.tipo}
          tipoResposta={secao.tipoResposta}
          etapasDefinidas={secao.etapasDefinidas}
          clientes={secao.clientes}
          tarefas={secao.tarefas}
          etapas={etapas}
          mes={mes}
          ano={ano}
          usuarioNome={usuarioNome}
          busca={busca}
          statusFiltro={statusFiltro}
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
        />
      ))}
    </div>
  )
}
