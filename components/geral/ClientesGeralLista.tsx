'use client'

import { useState, useMemo } from 'react'
import type { Cliente, TarefaVinculo } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'

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
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientesGeral:regime', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('clientesGeral:atividade', [])
  const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'regime'; direcao: 'asc' | 'desc' } | null>(null)

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  function toggleOrdenacao(campo: 'nome' | 'regime') {
    setOrdenacao(atual => {
      if (atual?.campo !== campo) return { campo, direcao: 'asc' }
      if (atual.direcao === 'asc') return { campo, direcao: 'desc' }
      return null
    })
  }

  const filtrados = useMemo(() => {
    const lista = clientes.filter(c => {
      if (busca) {
        const q = busca.toLowerCase()
        if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
      }
      if (filtroRegime !== 'TODOS' && c.clientes_fiscal?.regime !== filtroRegime) return false
      if (filtroAtividade.length > 0 && !filtroAtividade.some(a => (c.clientes_fiscal?.atividade ?? []).includes(a))) return false
      return true
    })

    if (!ordenacao) return lista

    const valor = (c: ClienteComDadosFiscais) => ordenacao.campo === 'nome'
      ? c.nome.toLowerCase()
      : (c.clientes_fiscal?.regime ?? '').toLowerCase()

    return [...lista].sort((a, b) => {
      const cmp = valor(a).localeCompare(valor(b))
      return ordenacao.direcao === 'asc' ? cmp : -cmp
    })
  }, [clientes, busca, filtroRegime, filtroAtividade, ordenacao])

  function iconeOrdenacao(campo: 'nome' | 'regime') {
    if (ordenacao?.campo !== campo) return <span className="text-[var(--fg)]/20">↕</span>
    return <span className="text-[var(--accent)]">{ordenacao.direcao === 'asc' ? '↑' : '↓'}</span>
  }

  const selectClass = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Clientes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/15 text-[var(--fg)] text-sm font-semibold hover:border-[var(--fg)]/30 transition-colors whitespace-nowrap">
            Imprimir
          </button>
          {podeCriar && (
            <button
              onClick={() => setModalNovoOpen(true)}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
              + Novo Cliente
            </button>
          )}
        </div>
      </div>

      <h1 className="hidden print-only text-2xl font-bold text-[var(--fg)] mb-6">Clientes</h1>

      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <input
          type="text"
          placeholder="Buscar por nome ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
        <select value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todos os regimes</option>
          {catalogoFiscal.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
      </div>

      {catalogoFiscal.atividades.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
          <span className="text-xs text-[var(--fg)]/40">Atividade:</span>
          {catalogoFiscal.atividades.map(nome => (
            <button
              key={nome}
              type="button"
              onClick={() => toggleAtividade(nome)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtroAtividade.includes(nome)
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              <th className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">
                <button type="button" onClick={() => toggleOrdenacao('nome')} className="flex items-center gap-1.5 hover:text-[var(--fg)] transition-colors">
                  Razão Social {iconeOrdenacao('nome')}
                </button>
              </th>
              <th className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">CNPJ</th>
              <th className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">Endereço</th>
              <th className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">
                <button type="button" onClick={() => toggleOrdenacao('regime')} className="flex items-center gap-1.5 hover:text-[var(--fg)] transition-colors">
                  Regime {iconeOrdenacao('regime')}
                </button>
              </th>
              <th className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">Atividade</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(c => (
              <tr key={c.id} onClick={() => setClienteAbertoId(c.id)}
                className="border-b border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-[var(--fg)] text-sm font-medium whitespace-nowrap">{c.nome}</td>
                <td className="px-4 py-3 text-[var(--fg)]/50 text-xs font-mono whitespace-nowrap">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--fg)]/60 text-xs whitespace-nowrap">
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
