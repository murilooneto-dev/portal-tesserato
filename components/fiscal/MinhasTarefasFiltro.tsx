'use client'

import { useMemo, useState } from 'react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { filtrarClientes } from '@/lib/minhas-tarefas-filtro'
import type { SecaoRelatorio } from '@/lib/relatorio-minhas-tarefas-pdf'
import MinhasTarefasSecao from './MinhasTarefasSecao'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

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
  clientes: { id: string; nome: string; atividade: string[] }[]
  tarefas: Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
}

interface Props {
  secoes: Secao[]
  atividadesCatalogo: string[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  nomeUsuario: string
  onToggle: (clienteId: string, tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
}

const inputCls = "flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const selectCls = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const botaoPdfCls = "px-4 py-2 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-sm font-medium hover:bg-[var(--accent)]/25 transition-colors disabled:opacity-40"

function getIsoTarefa(tarefa: Pick<Tarefa, 'concluida' | 'concluida_em'> | undefined): string | null {
  return tarefa?.concluida && tarefa.concluida_em ? tarefa.concluida_em.slice(0, 10) : null
}

function getIsoEtapa(etapas: TarefaEtapa[], tarefaId: string | undefined, etapaNome: string): string | null {
  const e = etapas.find(e => e.tarefa_id === tarefaId && e.nome === etapaNome)
  return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : null
}

export default function MinhasTarefasFiltro({ secoes, atividadesCatalogo, etapas, mes, ano, nomeUsuario, onToggle, onAtualizarEtapa }: Props) {
  const [busca, setBusca] = useFiltroPersistente('minhas-tarefas:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<StatusFiltroMinhasTarefas>('minhas-tarefas:status', 'TODOS')
  const [tarefaFiltro, setTarefaFiltro] = useFiltroPersistente('minhas-tarefas:tarefa', 'TODAS')
  const [atividadeFiltro, setAtividadeFiltro] = useFiltroPersistente<string[]>('minhas-tarefas:atividade', [])
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const secoesFiltradas = useMemo(
    () => secoes.filter(s => tarefaFiltro === 'TODAS' || s.tipo === tarefaFiltro),
    [secoes, tarefaFiltro],
  )

  function toggleAtividade(nome: string) {
    setAtividadeFiltro(
      atividadeFiltro.includes(nome) ? atividadeFiltro.filter(a => a !== nome) : [...atividadeFiltro, nome]
    )
  }

  async function handleGerarPdf() {
    setGerandoPdf(true)
    try {
      const secoesRelatorio: SecaoRelatorio[] = secoesFiltradas.map(secao => {
        if (secao.tipoResposta !== 'data') {
          return { tipo: secao.tipo, colunas: [], linhas: [], mensagem: 'Esse tipo não é de data/etapas — edite pela ficha de cada cliente.' }
        }
        const mapaTarefa = new Map(secao.tarefas.map(t => [t.cliente_id, t]))
        const clientesFiltrados = filtrarClientes(secao.clientes, mapaTarefa, busca, statusFiltro, atividadeFiltro)
        const colunas = secao.etapasDefinidas ?? ['Data']
        const linhas = clientesFiltrados.map(cliente => {
          const tarefa = mapaTarefa.get(cliente.id)
          const datas = secao.etapasDefinidas
            ? secao.etapasDefinidas.map(nome => getIsoEtapa(etapas, tarefa?.id, nome))
            : [getIsoTarefa(tarefa)]
          return { nome: cliente.nome, semMovimento: !!tarefa?.sem_movimento, datas }
        })
        return { tipo: secao.tipo, colunas, linhas }
      })

      const partesFiltro: string[] = []
      if (busca) partesFiltro.push(`busca "${busca}"`)
      if (tarefaFiltro !== 'TODAS') partesFiltro.push(`Tarefa: ${tarefaFiltro}`)
      if (statusFiltro !== 'TODOS') partesFiltro.push(`Status: ${LABEL_STATUS[statusFiltro]}`)
      if (atividadeFiltro.length > 0) partesFiltro.push(`Atividade: ${atividadeFiltro.join(', ')}`)

      const [{ pdf }, { default: RelatorioMinhasTarefasDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/relatorio-minhas-tarefas-pdf'),
      ])

      const blob = await pdf(
        <RelatorioMinhasTarefasDocument
          nomeUsuario={nomeUsuario}
          mesNome={MESES_NOME[mes - 1]}
          ano={ano}
          filtrosResumo={partesFiltro.length > 0 ? partesFiltro.join(' · ') : null}
          secoes={secoesRelatorio}
        />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minhas-tarefas-${mes}-${ano}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGerandoPdf(false)
    }
  }

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
        <button type="button" onClick={handleGerarPdf} disabled={gerandoPdf} className={botaoPdfCls}>
          {gerandoPdf ? 'Gerando...' : 'Gerar Relatório em PDF'}
        </button>
      </div>

      {atividadesCatalogo.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-4">
          <span className="text-xs text-[var(--fg)]/40">Atividade:</span>
          {atividadesCatalogo.map(nome => (
            <button
              key={nome}
              type="button"
              onClick={() => toggleAtividade(nome)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                atividadeFiltro.includes(nome)
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

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
          busca={busca}
          statusFiltro={statusFiltro}
          atividadeFiltro={atividadeFiltro}
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
        />
      ))}
    </div>
  )
}
