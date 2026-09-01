'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  type CampoFiltro,
  type ClienteFiltro,
  valoresDistintos,
  clientesPorValor,
  tarefasTipoDataVinculadas,
} from '@/lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '@/lib/tarefas-esperadas'

const LABEL_CAMPO: Record<CampoFiltro, string> = {
  grupo: 'Grupo',
  regime: 'Regime',
  atividade: 'Atividade',
}

interface Props {
  camposDisponiveis: CampoFiltro[]
  clientes: ClienteFiltro[]
  mapaVinculos: MapaVinculosSetor
  tiposData: string[]
  estadoInicial: Record<string, Record<string, boolean>>
  onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
}

export default function PreenchimentoRapido({
  camposDisponiveis,
  clientes,
  mapaVinculos,
  tiposData,
  estadoInicial,
  onToggle,
}: Props) {
  const [campo, setCampo] = useState<CampoFiltro | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [tarefasSelecionadas, setTarefasSelecionadas] = useState<Set<string>>(new Set())
  const [overlay, setOverlay] = useState<Record<string, Record<string, boolean>>>({})
  const [, startTransition] = useTransition()

  function getConcluida(clienteId: string, tipo: string): boolean {
    return overlay[clienteId]?.[tipo] ?? estadoInicial[clienteId]?.[tipo] ?? false
  }

  const tiposDataSet = useMemo(() => new Set(tiposData), [tiposData])

  const valores = useMemo(
    () => (campo ? valoresDistintos(clientes, campo) : []),
    [clientes, campo],
  )

  const tarefasDisponiveis = useMemo(
    () => (campo && valor ? tarefasTipoDataVinculadas(mapaVinculos, campo, valor, tiposDataSet) : []),
    [mapaVinculos, campo, valor, tiposDataSet],
  )

  const clientesFiltrados = useMemo(
    () => (campo && valor ? clientesPorValor(clientes, campo, valor) : []),
    [clientes, campo, valor],
  )

  function handleCampoChange(novoCampo: CampoFiltro) {
    setCampo(novoCampo)
    setValor(null)
    setTarefasSelecionadas(new Set())
  }

  function handleValorChange(novoValor: string) {
    setValor(novoValor)
    setTarefasSelecionadas(new Set())
  }

  function toggleTarefaSelecionada(tipo: string) {
    setTarefasSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  function handleCheckbox(clienteId: string, tipo: string) {
    const concluidaAtual = getConcluida(clienteId, tipo)
    const novaConcluida = !concluidaAtual
    setOverlay(prev => ({
      ...prev,
      [clienteId]: { ...prev[clienteId], [tipo]: novaConcluida },
    }))
    startTransition(() => {
      onToggle(clienteId, tipo, novaConcluida)
    })
  }

  const colunas = Array.from(tarefasSelecionadas).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-[var(--fg)]/40 mb-1">Filtrar por</label>
          <select
            value={campo ?? ''}
            onChange={e => handleCampoChange(e.target.value as CampoFiltro)}
            className="bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="" disabled className="bg-[var(--bg-surface)]">Selecione...</option>
            {camposDisponiveis.map(c => (
              <option key={c} value={c} className="bg-[var(--bg-surface)]">{LABEL_CAMPO[c]}</option>
            ))}
          </select>
        </div>

        {campo && (
          <div>
            <label className="block text-xs text-[var(--fg)]/40 mb-1">{LABEL_CAMPO[campo]}</label>
            <select
              value={valor ?? ''}
              onChange={e => handleValorChange(e.target.value)}
              className="bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)]"
            >
              <option value="" disabled className="bg-[var(--bg-surface)]">Selecione...</option>
              {valores.map(v => (
                <option key={v} value={v} className="bg-[var(--bg-surface)]">{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {campo && valores.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhum cliente tem {LABEL_CAMPO[campo].toLowerCase()} cadastrado.
        </p>
      )}

      {campo && valor && tarefasDisponiveis.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhuma tarefa do tipo data vinculada a {LABEL_CAMPO[campo].toLowerCase()} &quot;{valor}&quot;.
        </p>
      )}

      {campo && valor && tarefasDisponiveis.length > 0 && (
        <div>
          <label className="block text-xs text-[var(--fg)]/40 mb-2">Tarefas</label>
          <div className="flex flex-wrap gap-2">
            {tarefasDisponiveis.map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleTarefaSelecionada(tipo)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tarefasSelecionadas.has(tipo)
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                    : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
        </div>
      )}

      {colunas.length > 0 && (
        clientesFiltrados.length === 0 ? (
          <p className="text-sm text-[var(--fg)]/40">Nenhum cliente encontrado para esse filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--fg)]/10">
                  <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Empresa</th>
                  {colunas.map(tipo => (
                    <th key={tipo} className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium whitespace-nowrap">
                      {tipo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(cliente => (
                  <tr key={cliente.id} className="border-b border-[var(--fg)]/5">
                    <td className="py-2 px-3 text-[var(--fg)]">{cliente.nome}</td>
                    {colunas.map(tipo => (
                      <td key={tipo} className="text-center py-2 px-3">
                        <input
                          type="checkbox"
                          checked={getConcluida(cliente.id, tipo)}
                          onChange={() => handleCheckbox(cliente.id, tipo)}
                          className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
