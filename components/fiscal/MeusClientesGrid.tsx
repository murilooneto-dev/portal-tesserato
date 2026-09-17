'use client'

import { useMemo, useState, useTransition } from 'react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'

export interface ClienteMeusClientes {
  id: string
  nome: string
  cnpj: string | null
  responsavel: string | null
  regime: string | null
  atividade: string[]
  esperadas: string[]
}

interface Props {
  clientes: ClienteMeusClientes[]
  colunas: string[]
  estadoInicial: Record<string, Record<string, boolean>>
  somenteLeitura?: boolean
  onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
}

const inputCls = "flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function MeusClientesGrid({ clientes, colunas, estadoInicial, somenteLeitura, onToggle }: Props) {
  const [busca, setBusca] = useFiltroPersistente('meus-clientes:busca', '')
  const [overlay, setOverlay] = useState<Record<string, Record<string, boolean>>>({})
  const [, startTransition] = useTransition()

  function getConcluida(clienteId: string, tipo: string): boolean {
    return overlay[clienteId]?.[tipo] ?? estadoInicial[clienteId]?.[tipo] ?? false
  }

  function handleCheckbox(clienteId: string, tipo: string) {
    if (somenteLeitura) return
    const novaConcluida = !getConcluida(clienteId, tipo)
    setOverlay(prev => ({ ...prev, [clienteId]: { ...prev[clienteId], [tipo]: novaConcluida } }))
    startTransition(() => { onToggle(clienteId, tipo, novaConcluida) })
  }

  // Só entra na grade quem tem pelo menos uma das colunas realmente
  // aplicável — cliente sem nenhuma delas não aparece nem como linha vazia.
  const linhas = useMemo(() => {
    return clientes.filter(c => {
      if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false
      return colunas.some(tipo => c.esperadas.includes(tipo))
    })
  }, [clientes, colunas, busca])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Buscar por nome do cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className={inputCls}
        />
      </div>

      {colunas.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">
          Nenhum dos seus tipos de tarefa é do formato simples (data, sem etapas) — veja a aba Tarefas.
        </p>
      ) : linhas.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--fg)]/10">
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Empresa</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Responsável</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Atividade</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Regime</th>
                <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">CNPJ</th>
                {colunas.map(tipo => (
                  <th key={tipo} className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium whitespace-nowrap">{tipo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map(cliente => (
                <tr key={cliente.id} className="border-b border-[var(--fg)]/5">
                  <td className="py-2 px-3 text-[var(--fg)]">{cliente.nome}</td>
                  <td className="py-2 px-3 text-[var(--fg)]/60">{cliente.responsavel ?? '—'}</td>
                  <td className="py-2 px-3 text-[var(--fg)]/60">{cliente.atividade.join(', ') || '—'}</td>
                  <td className="py-2 px-3 text-[var(--fg)]/60">{cliente.regime ?? '—'}</td>
                  <td className="py-2 px-3 text-[var(--fg)]/60 font-mono text-xs">{cliente.cnpj ?? '—'}</td>
                  {colunas.map(tipo => (
                    <td key={tipo} className="text-center py-2 px-3">
                      {cliente.esperadas.includes(tipo) ? (
                        <input
                          type="checkbox"
                          checked={getConcluida(cliente.id, tipo)}
                          onChange={() => handleCheckbox(cliente.id, tipo)}
                          disabled={somenteLeitura}
                          className="w-4 h-4 accent-[var(--accent)] cursor-pointer disabled:cursor-not-allowed"
                        />
                      ) : (
                        <span className="text-[var(--fg)]/10">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
