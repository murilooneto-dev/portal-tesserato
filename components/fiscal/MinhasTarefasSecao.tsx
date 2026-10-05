'use client'

import Link from 'next/link'
import { Fragment, useState, useTransition } from 'react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { isoParaDisplay, displayParaIso, autoFormatarData } from '@/lib/data-checklist'
import { desbloquearTarefa, marcarSemMovimento } from '@/app/fiscal/clientes/actions'
import { filtrarClientes } from '@/lib/minhas-tarefas-filtro'
import type { StatusFiltroMinhasTarefas } from './MinhasTarefasFiltro'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox, Input, Textarea } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

interface Props {
  tipo: string
  tipoResposta: TipoResposta
  etapasDefinidas: string[] | null
  clientes: { id: string; nome: string; atividade: string[] }[]
  tarefas: Pick<Tarefa, 'id' | 'cliente_id' | 'tipo' | 'concluida' | 'concluida_em' | 'sem_movimento'>[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  busca: string
  statusFiltro: StatusFiltroMinhasTarefas
  atividadeFiltro: string[]
  somenteLeitura?: boolean
  onToggle: (clienteId: string, tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (clienteId: string, tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
}

export default function MinhasTarefasSecao({
  tipo,
  tipoResposta,
  etapasDefinidas,
  clientes,
  tarefas,
  etapas,
  mes,
  ano,
  busca,
  statusFiltro,
  atividadeFiltro,
  somenteLeitura,
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

  const clientesFiltrados = filtrarClientes(clientes, mapaTarefa, busca, statusFiltro, atividadeFiltro, getSemMovimento)

  async function handleUnlock(clienteId: string) {
    const motivoTrim = motivo.trim()
    if (!motivoTrim) return
    const tarefa = mapaTarefa.get(clienteId)
    if (!tarefa) return
    setUnlockPending(true)
    try {
      await desbloquearTarefa(tarefa.id, motivoTrim, tipo, competencia)
      setOverlay(prev => ({ ...prev, [chave(clienteId, null)]: null }))
      setUnlockingCliente(null)
      setMotivo('')
    } finally {
      setUnlockPending(false)
    }
  }

  const colunas: (string | null)[] = etapasDefinidas ?? [null]

  function campoData(clienteId: string, etapaNome: string | null, nomeCliente: string, classe: string) {
    const iso = getSavedIso(clienteId, etapaNome)
    return (
      <Input
        type="text"
        value={getDisplayValue(clienteId, etapaNome)}
        onChange={e => handleChange(clienteId, etapaNome, e.target.value)}
        onBlur={() => handleBlur(clienteId, etapaNome)}
        placeholder="dd/mm/aaaa"
        aria-label={`${etapaNome ?? 'Data'} de ${nomeCliente}`}
        maxLength={10}
        disabled={somenteLeitura}
        className={`text-center tabular-nums ${iso !== '' ? 'border-ok-soft text-ok' : ''} ${classe}`}
      />
    )
  }

  function formDesbloqueio(clienteId: string) {
    return (
      <div className="flex flex-col gap-2 rounded-[10px] border border-line-soft bg-inset p-3 text-left">
        <p className="text-[13px] text-fg-2">Informe o motivo para desbloquear esta tarefa:</p>
        <Textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo obrigatório..."
          aria-label="Motivo do desbloqueio"
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variante="fantasma" tamanho="p" className="max-sm:h-11" onClick={() => { setUnlockingCliente(null); setMotivo('') }}>
            Cancelar
          </Button>
          <Button
            variante="primario"
            tamanho="p"
            className="max-sm:h-11"
            onClick={() => handleUnlock(clienteId)}
            disabled={!motivo.trim() || unlockPending}
          >
            {unlockPending ? 'Aguarde...' : 'Confirmar desbloqueio'}
          </Button>
        </div>
      </div>
    )
  }

  function checkSemMovimento(clienteId: string, nomeCliente: string) {
    return (
      <Checkbox
        rotulo="Sem movimento"
        aria-label={`Sem movimento: ${nomeCliente}`}
        checked={getSemMovimento(clienteId)}
        onChange={() => handleToggleSemMovimento(clienteId)}
        disabled={somenteLeitura}
        className="min-h-11 whitespace-nowrap sm:min-h-0"
      />
    )
  }

  const contagem = !etapasDefinidas && tipoResposta === 'data'
    ? `${concluidas}/${clientes.length}`
    : String(clientes.length)

  return (
    <Card
      titulo={tipo}
      meta={<Badge tom="neu">{contagem}</Badge>}
      semPadding
      className="overflow-hidden"
    >
      {clientes.length === 0 ? (
        <p className="px-[18px] py-4 text-sm text-fg-3">Nenhum cliente com essa tarefa aplicável.</p>
      ) : tipoResposta !== 'data' ? (
        <p className="px-[18px] py-4 text-sm text-fg-3">
          Esse tipo não é de data/etapas — edite pela ficha de cada cliente.
        </p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="px-[18px] py-4 text-sm text-fg-3">Nenhum cliente encontrado com esse filtro.</p>
      ) : (
        <>
          <div className="hidden sm:block"><div className="relative overflow-x-auto overflow-y-hidden">
            <Tabela className="min-w-[640px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  {(etapasDefinidas ?? ['Data']).map(col => (
                    <Th key={col} alinhar="centro" largura={150}>{col}</Th>
                  ))}
                  <Th alinhar="centro" largura={170}>Sem movimento</Th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(cliente => {
                  const semMovimentoAtivo = getSemMovimento(cliente.id)
                  return (
                    <Fragment key={cliente.id}>
                      <tr>
                        <Td>
                          <Link href={`/fiscal/clientes/${cliente.id}`} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                            <NomeCliente nome={cliente.nome} />
                          </Link>
                        </Td>
                        {semMovimentoAtivo ? (
                          <Td colSpan={colunas.length} alinhar="centro">
                            <Badge tom="neu">Sem movimento</Badge>
                          </Td>
                        ) : colunas.map(etapaNome => (
                          <Td key={etapaNome ?? '_'} alinhar="centro">
                            {campoData(cliente.id, etapaNome, cliente.nome, 'w-[128px]')}
                          </Td>
                        ))}
                        <Td alinhar="centro">{checkSemMovimento(cliente.id, cliente.nome)}</Td>
                      </tr>
                      {!etapasDefinidas && unlockingCliente === cliente.id && (
                        <tr>
                          <Td colSpan={colunas.length + 2}>{formDesbloqueio(cliente.id)}</Td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </Tabela>
          </div></div>

          <ul className="flex flex-col sm:hidden">
            {clientesFiltrados.map(cliente => {
              const semMovimentoAtivo = getSemMovimento(cliente.id)
              return (
                <li key={cliente.id} className="flex flex-col gap-2 border-b border-line-soft px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/fiscal/clientes/${cliente.id}`} className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                      <NomeCliente nome={cliente.nome} />
                    </Link>
                    {checkSemMovimento(cliente.id, cliente.nome)}
                  </div>
                  {semMovimentoAtivo ? (
                    <Badge tom="neu" className="self-start">Sem movimento</Badge>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {colunas.map(etapaNome => (
                        <div key={etapaNome ?? '_'} className="flex items-center justify-between gap-3">
                          {etapaNome && <span className="min-w-0 flex-1 text-[13px] text-fg-2">{etapaNome}</span>}
                          {campoData(cliente.id, etapaNome, cliente.nome, etapaNome ? 'h-11 w-[150px]' : 'h-11 w-full')}
                        </div>
                      ))}
                    </div>
                  )}
                  {!etapasDefinidas && unlockingCliente === cliente.id && formDesbloqueio(cliente.id)}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}
