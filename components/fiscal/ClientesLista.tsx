'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'

const CORES_REGIME: Record<string, string> = {
  'Simples':   '#10b981',
  'Presumido': '#0ea5e9',
  'Real':      '#8b5cf6',
  'MEI':       '#f59e0b',
  'Isenta':    '#6b7280',
}

function corRegime(regime: string) {
  for (const [key, cor] of Object.entries(CORES_REGIME)) {
    if (regime.toLowerCase().includes(key.toLowerCase())) return cor
  }
  return '#6b7280'
}

interface Props {
  clientes: Cliente[]
}

export default function ClientesLista({ clientes }: Props) {
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('TODOS')

  const responsaveis = ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()]

  const filtrados = clientes.filter(c => {
    const matchBusca = busca === '' ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (c.cnpj ?? '').includes(busca) ||
      (c.cod ?? '').includes(busca)
    const matchResp = filtroResponsavel === 'TODOS' || c.responsavel === filtroResponsavel
    return matchBusca && matchResp
  })

  return (
    <div>
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou código..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors"
        />
        <select
          value={filtroResponsavel}
          onChange={e => setFiltroResponsavel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4] transition-colors"
        >
          {responsaveis.map(r => (
            <option key={r} value={r} className="bg-[#0d1117]">{r}</option>
          ))}
        </select>
      </div>

      <p className="text-white/30 text-xs mb-4">{filtrados.length} clientes</p>

      <div className="flex flex-col gap-2">
        {filtrados.map(cliente => (
          <Link
            key={cliente.id}
            href={`/fiscal/clientes/${cliente.id}`}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/3 border border-white/6 hover:bg-white/6 hover:border-white/12 transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
              <span className="text-white/40 text-xs font-mono">{cliente.cod ?? '—'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{cliente.nome}</p>
              <p className="text-white/30 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {cliente.regime && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    backgroundColor: corRegime(cliente.regime) + '20',
                    color: corRegime(cliente.regime),
                    border: `1px solid ${corRegime(cliente.regime)}40`,
                  }}
                >
                  {cliente.regime.split('/')[0].trim()}
                </span>
              )}
              {cliente.responsavel && (
                <span className="text-white/30 text-xs hidden md:block">{cliente.responsavel}</span>
              )}
            </div>
          </Link>
        ))}

        {filtrados.length === 0 && (
          <p className="text-center text-white/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  )
}
