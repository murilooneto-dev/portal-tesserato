'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  type CampoFiltro,
  type ClienteFiltro,
  valoresDistintos,
  clientesPorValor,
  tarefasAplicaveisCliente,
  tarefasDisponiveisParaClientes,
  linhasVisiveis as calcularLinhasVisiveis,
} from '@/lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '@/lib/tarefas-esperadas'

const LABEL_CAMPO: Record<CampoFiltro, string> = {
  regime: 'Regime',
  atividade: 'Atividade',
}

interface Props {
  camposDisponiveis: CampoFiltro[]
  clientes: ClienteFiltro[]
  mapaVinculos: MapaVinculosSetor
  tiposData: string[]
  tiposNaoData?: string[]
  filtroPendentes?: boolean
  estadoInicial: Record<string, Record<string, boolean>>
  onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
}

export default function PreenchimentoRapido({
  camposDisponiveis,
  clientes,
  mapaVinculos,
  tiposData,
  tiposNaoData,
  filtroPendentes = false,
  estadoInicial,
  onToggle,
}: Props) {
  const [campo, setCampo] = useState<CampoFiltro | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [tarefasSelecionadas, setTarefasSelecionadas] = useState<Set<string>>(new Set())
  const [overlay, setOverlay] = useState<Record<string, Record<string, boolean>>>({})
  const [apenasPendentes, setApenasPendentes] = useState(false)
  const [, startTransition] = useTransition()

  function getConcluida(clienteId: string, tipo: string): boolean {
    return overlay[clienteId]?.[tipo] ?? estadoInicial[clienteId]?.[tipo] ?? false
  }

  const modoDireto = camposDisponiveis.length === 0

  const tiposDataSet = useMemo(() => new Set(tiposData), [tiposData])
  const tiposNaoDataSet = useMemo(() => new Set(tiposNaoData ?? []), [tiposNaoData])

  const valores = useMemo(
    () => (campo ? valoresDistintos(clientes, campo) : []),
    [clientes, campo],
  )

  const clientesFiltrados = useMemo(() => {
    if (modoDireto) return clientes
    return campo && valor ? clientesPorValor(clientes, campo, valor) : []
  }, [modoDireto, clientes, campo, valor])

  // Por cliente, o conjunto real de tarefas tipo DATA que se aplicam a ele
  // (vínculo automático atividade+regime menos exclusões, mais
  // personalizadas) — fonte de verdade tanto pros botões de tarefa quanto
  // pra decidir quais linhas/células aparecem na grade.
  const tarefasAplicaveisPorCliente = useMemo(() => {
    const porCliente: Record<string, Set<string>> = {}
    for (const c of clientesFiltrados) {
      porCliente[c.id] = tarefasAplicaveisCliente(c, mapaVinculos, tiposDataSet, tiposNaoDataSet)
    }
    return porCliente
  }, [clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet])

  const tarefasDisponiveis = useMemo(
    () => tarefasDisponiveisParaClientes(clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet),
    [clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet],
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

  // Só entra na grade quem tem pelo menos uma das tarefas marcadas
  // realmente aplicável — cliente sem nenhuma delas não aparece nem como
  // linha vazia (ex: AB Preço Único não deve aparecer pra "Distribuição
  // de Lucros" se essa tarefa não é dela). Com o filtro "Só pendentes"
  // ativo, quem já tem todas as colunas selecionadas concluídas também some.
  const linhas = calcularLinhasVisiveis(
    clientesFiltrados,
    colunas,
    tarefasAplicaveisPorCliente,
    getConcluida,
    filtroPendentes && apenasPendentes,
  )

  return (
    <div className="flex flex-col gap-6">
      {!modoDireto && (
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
      )}

      {!modoDireto && campo && valores.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhum cliente tem {LABEL_CAMPO[campo].toLowerCase()} cadastrado.
        </p>
      )}

      {!modoDireto && campo && valor && tarefasDisponiveis.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhuma tarefa do tipo data vinculada a {LABEL_CAMPO[campo].toLowerCase()} &quot;{valor}&quot;.
        </p>
      )}

      {modoDireto && tarefasDisponiveis.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhuma tarefa tipo data cadastrada nesse setor.
        </p>
      )}

      {(modoDireto || (campo && valor)) && tarefasDisponiveis.length > 0 && (
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

      {filtroPendentes && colunas.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-[var(--fg)]/60 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={apenasPendentes}
            onChange={e => setApenasPendentes(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
          Só pendentes
        </label>
      )}

      {colunas.length > 0 && (
        linhas.length === 0 ? (
          <p className="text-sm text-[var(--fg)]/40">
            {apenasPendentes
              ? 'Nenhum cliente com essa(s) tarefa(s) pendente(s).'
              : 'Nenhum cliente tem essa(s) tarefa(s) aplicável(is).'}
          </p>
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
                {linhas.map(cliente => (
                  <tr key={cliente.id} className="border-b border-[var(--fg)]/5">
                    <td className="py-2 px-3 text-[var(--fg)]">{cliente.nome}</td>
                    {colunas.map(tipo => (
                      <td key={tipo} className="text-center py-2 px-3">
                        {tarefasAplicaveisPorCliente[cliente.id]?.has(tipo) ? (
                          <input
                            type="checkbox"
                            checked={getConcluida(cliente.id, tipo)}
                            onChange={() => handleCheckbox(cliente.id, tipo)}
                            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                          />
                        ) : (
                          <span className="text-[var(--fg)]/20">—</span>
                        )}
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
