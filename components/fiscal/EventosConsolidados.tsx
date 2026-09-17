'use client'

import { useMemo, useState } from 'react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import EventoAvulsoModal from '@/components/geral/EventoAvulsoModal'

interface GrupoCliente {
  clienteId: string
  clienteNome: string
  eventos: TarefaAvulsaComCriador[]
}

interface Props {
  clientes: { id: string; nome: string }[]
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
}

const inputCls = "flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function EventosConsolidados({ clientes, eventos, podeEditar }: Props) {
  const [busca, setBusca] = useFiltroPersistente('eventos-consolidados:busca', '')
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [buscaSeletor, setBuscaSeletor] = useState('')
  const [clienteNovoEvento, setClienteNovoEvento] = useState<string | null>(null)

  const nomePorCliente = useMemo(() => new Map(clientes.map(c => [c.id, c.nome])), [clientes])

  // Só entram na lista clientes com pelo menos um evento no mês — sem isso
  // teríamos uma seção vazia por cliente do setor inteiro.
  const grupos = useMemo<GrupoCliente[]>(() => {
    const porCliente = new Map<string, TarefaAvulsaComCriador[]>()
    for (const ev of eventos) {
      const lista = porCliente.get(ev.cliente_id) ?? []
      lista.push(ev)
      porCliente.set(ev.cliente_id, lista)
    }
    return Array.from(porCliente.entries())
      .map(([clienteId, evs]) => ({ clienteId, clienteNome: nomePorCliente.get(clienteId) ?? 'Cliente', eventos: evs }))
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'))
  }, [eventos, nomePorCliente])

  const gruposFiltrados = busca
    ? grupos.filter(g => g.clienteNome.toLowerCase().includes(busca.toLowerCase()))
    : grupos

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [clientes],
  )

  const clientesSeletorFiltrados = buscaSeletor
    ? clientesOrdenados.filter(c => c.nome.toLowerCase().includes(buscaSeletor.toLowerCase()))
    : clientesOrdenados

  function fecharSeletor() {
    setSeletorAberto(false)
    setBuscaSeletor('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          placeholder="Buscar por nome do cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className={inputCls}
        />
        {podeEditar && (
          <button
            type="button"
            onClick={() => setSeletorAberto(true)}
            className="shrink-0 text-sm bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 px-4 py-2 rounded-xl transition-all font-semibold"
          >
            + Novo evento
          </button>
        )}
      </div>

      {gruposFiltrados.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum evento neste mês.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {gruposFiltrados.map(grupo => (
            <div key={grupo.clienteId}>
              <h4 className="text-sm font-semibold text-[var(--fg)] mb-2">{grupo.clienteNome}</h4>
              <EventosAvulsosSecao
                clienteId={grupo.clienteId}
                setor="fiscal"
                eventos={grupo.eventos}
                podeEditar={podeEditar}
                compacto
              />
            </div>
          ))}
        </div>
      )}

      {seletorAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={e => e.target === e.currentTarget && fecharSeletor()}>
          <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
              <h2 className="text-[var(--fg)] font-bold text-base">Escolha o cliente</h2>
              <button onClick={fecharSeletor} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
            </div>
            <div className="px-6 py-3 border-b border-[var(--fg)]/8 shrink-0">
              <input
                type="text"
                autoFocus
                placeholder="Buscar cliente..."
                value={buscaSeletor}
                onChange={e => setBuscaSeletor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              />
            </div>
            <div className="overflow-y-auto flex-1 py-2">
              {clientesSeletorFiltrados.length === 0 ? (
                <p className="text-center text-[var(--fg)]/25 text-sm py-6">Nenhum cliente encontrado.</p>
              ) : (
                clientesSeletorFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setClienteNovoEvento(c.id); fecharSeletor() }}
                    className="w-full text-left px-6 py-2.5 text-sm text-[var(--fg)]/80 hover:bg-[var(--fg)]/5 hover:text-[var(--fg)] transition-colors"
                  >
                    {c.nome}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {clienteNovoEvento && (
        <EventoAvulsoModal
          clienteId={clienteNovoEvento}
          setor="fiscal"
          onClose={() => setClienteNovoEvento(null)}
        />
      )}
    </div>
  )
}
