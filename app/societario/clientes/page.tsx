'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'

interface ClienteResumo {
  id: string
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
}

export default function ClientesSocietarioPage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('societario-clientes:busca', '')

  useEffect(() => {
    const sb = createClient()
    sb.from('clientes').select('id, nome, cnpj, municipio, uf').order('nome').then(({ data }) => {
      setClientes(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = clientes.filter(c => {
    const q = search.toLowerCase()
    return !search || c.nome.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)
  })

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-3 px-8 py-4 bg-[var(--bg-surface-2)] border-b border-[var(--fg)]/8 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-[var(--fg)] whitespace-nowrap">Clientes</h1>
        <input type="text" placeholder="Buscar nome ou CNPJ..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/40" />
      </div>

      <div className="p-8">
        {loading && <p className="text-[var(--fg)]/30 text-sm">Carregando...</p>}

        {!loading && filtered.length > 0 && (
          <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/2">
                    <th className="text-left px-4 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Razão Social</th>
                    <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">CNPJ</th>
                    <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Município / UF</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}
                      onClick={() => router.push(`/societario/clientes/${c.id}`)}
                      className="border-b border-[var(--fg)]/5 cursor-pointer hover:bg-[var(--fg)]/2 transition-colors">
                      <td className="px-4 py-3 text-[var(--fg)] font-semibold whitespace-nowrap">{c.nome}</td>
                      <td className="px-3 py-3 text-[var(--fg)]/50 font-mono whitespace-nowrap">{c.cnpj ?? '—'}</td>
                      <td className="px-3 py-3 text-[var(--fg)]/50">{c.municipio ? `${c.municipio}${c.uf ? `/${c.uf}` : ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 text-sm py-16">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  )
}
