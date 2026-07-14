'use client'

import { useState, useMemo } from 'react'
import type { Cliente } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'

interface Props {
  clientes: Cliente[]
  isAdmin: boolean
  responsaveis: string[]
  templates: Record<string, string[]>
}

export default function ClientesGeralLista({ clientes, isAdmin, responsaveis, templates }: Props) {
  const [busca, setBusca] = useState('')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [clienteAbertoId, setClienteAbertoId] = useState<string | null>(null)

  const filtrados = useMemo(() => clientes.filter(c => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return c.nome.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)
  }), [clientes, busca])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Clientes</h1>
        {isAdmin && (
          <button
            onClick={() => setModalNovoOpen(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
            + Novo Cliente
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por nome ou CNPJ..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="w-full mb-4 px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {['Razão Social', 'CNPJ', 'Endereço'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(c => (
              <tr key={c.id} onClick={() => setClienteAbertoId(c.id)}
                className="border-b border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-[var(--fg)] text-sm font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-[var(--fg)]/50 text-xs font-mono">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--fg)]/60 text-xs">
                  {[c.municipio, c.uf].filter(Boolean).join('/') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}
      </div>

      {modalNovoOpen && (
        <ClienteGeralModal
          clienteId={null}
          responsaveis={responsaveis}
          templates={templates}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          responsaveis={responsaveis}
          templates={templates}
          readOnly={!isAdmin}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
    </div>
  )
}
