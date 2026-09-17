'use client'

import { useState, useMemo } from 'react'
import type { Cliente, TarefaVinculo } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

const CORES_REGIME: Record<string, string> = {
  simples:   '#10b981',
  presumido: '#0ea5e9',
  real:      '#8b5cf6',
  mei:       '#f59e0b',
  isenta:    '#6b7280',
  normal:    '#3b82f6',
}

function corRegime(regime: string): string {
  const r = regime.toLowerCase()
  for (const [key, cor] of Object.entries(CORES_REGIME)) {
    if (r.includes(key)) return cor
  }
  return '#6b7280'
}

type ClienteComDadosFiscais = Cliente & {
  clientes_fiscal: { regime: string | null; atividade: string[] } | null
}

interface Props {
  clientes: ClienteComDadosFiscais[]
  isAdmin: boolean
  podeCriar: boolean
  responsaveis: string[]
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
}

export default function ClientesGeralLista({ clientes, isAdmin, podeCriar, responsaveis, vinculosCatalogo, catalogoFiscal }: Props) {
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
        {podeCriar && (
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
              {['Razão Social', 'CNPJ', 'Endereço', 'Regime', 'Atividade'].map(h => (
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
                <td className="px-4 py-3 text-xs">
                  {c.clientes_fiscal?.regime ? (
                    <span className="font-bold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: corRegime(c.clientes_fiscal.regime) + '25', color: corRegime(c.clientes_fiscal.regime), border: `1px solid ${corRegime(c.clientes_fiscal.regime)}50` }}>
                      {c.clientes_fiscal.regime.split('/')[0].trim()}
                    </span>
                  ) : (
                    <span className="text-[var(--fg)]/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(c.clientes_fiscal?.atividade ?? []).map(a => (
                      <span key={a} className="font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                        {a}
                      </span>
                    ))}
                    {(c.clientes_fiscal?.atividade ?? []).length === 0 && (
                      <span className="text-[var(--fg)]/30">—</span>
                    )}
                  </div>
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
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          responsaveis={responsaveis}
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          readOnly={!isAdmin}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
    </div>
  )
}
