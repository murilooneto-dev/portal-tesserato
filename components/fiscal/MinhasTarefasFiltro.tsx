'use client'

import { useMemo, useState } from 'react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { filtrarClientes } from '@/lib/minhas-tarefas-filtro'
import type { SecaoRelatorio } from '@/lib/relatorio-minhas-tarefas-pdf'
import MinhasTarefasSecao from './MinhasTarefasSecao'
import { FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export type StatusFiltroMinhasTarefas = 'TODOS' | 'PENDENTE' | 'CONCLUIDA' | 'SEM_MOVIMENTO'

const LABEL_STATUS: Record<StatusFiltroMinhasTarefas, string> = {
  TODOS: 'Todos os status',
  PENDENTE: 'Pendente',
  CONCLUIDA: 'Concluída',
  SEM_MOVIMENTO: 'Sem movimento',
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
  somenteLeitura?: boolean
  onToggle: (clienteId: string, tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
}


function getIsoTarefa(tarefa: Pick<Tarefa, 'concluida' | 'concluida_em'> | undefined): string | null {
  return tarefa?.concluida && tarefa.concluida_em ? tarefa.concluida_em.slice(0, 10) : null
}

function getIsoEtapa(etapas: TarefaEtapa[], tarefaId: string | undefined, etapaNome: string): string | null {
  const e = etapas.find(e => e.tarefa_id === tarefaId && e.nome === etapaNome)
  return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : null
}

export default function MinhasTarefasFiltro({ secoes, atividadesCatalogo, etapas, mes, ano, nomeUsuario, somenteLeitura, onToggle, onAtualizarEtapa }: Props) {
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
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome do cliente" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Tarefa" className="w-full sm:w-[210px]">
          {c => (
            <Select id={c.id} value={tarefaFiltro} onChange={e => setTarefaFiltro(e.target.value)}>
              <option value="TODAS">Todas as tarefas</option>
              {secoes.map(s => <option key={s.tipo} value={s.tipo}>{s.tipo}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Status" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as StatusFiltroMinhasTarefas)}>
              {(Object.keys(LABEL_STATUS) as StatusFiltroMinhasTarefas[]).map(s => (
                <option key={s} value={s}>{LABEL_STATUS[s]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          icone={<FileText size={16} aria-hidden="true" />}
          onClick={handleGerarPdf}
          carregando={gerandoPdf}
          className="max-sm:h-11 max-sm:w-full sm:ml-auto"
        >
          {gerandoPdf ? 'Gerando...' : 'Gerar relatório em PDF'}
        </Button>
      </div>

      {atividadesCatalogo.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <span id="rotulo-minhas-tarefas-atividade" className="text-[13px] font-medium text-fg-2">Atividade</span>
          <div role="group" aria-labelledby="rotulo-minhas-tarefas-atividade" className="flex flex-wrap gap-2">
            {atividadesCatalogo.map(nome => (
              <Chip key={nome} ativo={atividadeFiltro.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
            ))}
          </div>
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
          somenteLeitura={somenteLeitura}
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
        />
      ))}
    </div>
  )
}
