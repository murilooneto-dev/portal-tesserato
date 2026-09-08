// app/admin/configuracoes/societario/VincularClientesModal.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  listarClientesParaVinculo,
  listarClienteIdsVinculados,
  alternarVinculoCliente,
  type ClienteResumo,
} from '@/lib/tarefa-tipo-vinculos-societario-actions'

interface Props {
  tarefaTipoId: string
  tarefaTipoNome: string
  onClose: () => void
}

const inputCls = "w-full px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function VincularClientesModal({ tarefaTipoId, tarefaTipoNome, onClose }: Props) {
  const [clientes, setClientes] = useState<ClienteResumo[]>([])
  const [vinculados, setVinculados] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const [clientesRes, vinculosRes] = await Promise.all([
        listarClientesParaVinculo(),
        listarClienteIdsVinculados(tarefaTipoId),
      ])
      if (clientesRes.error) setErro(clientesRes.error)
      else if (vinculosRes.error) setErro(vinculosRes.error)
      else {
        setClientes(clientesRes.data)
        setVinculados(new Set(vinculosRes.data))
        setErro(null)
      }
      setCarregando(false)
    }
    carregar()
  }, [tarefaTipoId])

  async function toggle(clienteId: string) {
    const jaVinculado = vinculados.has(clienteId)
    setVinculados(prev => {
      const novo = new Set(prev)
      jaVinculado ? novo.delete(clienteId) : novo.add(clienteId)
      return novo
    })

    const { error } = await alternarVinculoCliente(tarefaTipoId, clienteId, !jaVinculado)
    if (error) {
      setErro(error)
      setVinculados(prev => {
        const novo = new Set(prev)
        jaVinculado ? novo.add(clienteId) : novo.delete(clienteId)
        return novo
      })
    }
  }

  const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Clientes de &quot;{tarefaTipoNome}&quot;</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <p className="text-[var(--fg)]/40 text-xs mb-3">
            Vincular agora não cria pendências de meses/períodos passados — só a partir do período atual.
          </p>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente..."
            className={inputCls}
          />
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {erro && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              ⚠ {erro}
            </div>
          )}

          {carregando ? (
            <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
          ) : clientesFiltrados.length === 0 ? (
            <p className="text-[var(--fg)]/40 text-sm">Nenhum cliente encontrado.</p>
          ) : (
            <div className="space-y-1">
              {clientesFiltrados.map(c => (
                <label key={c.id} className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl hover:bg-[var(--fg)]/5">
                  <input
                    type="checkbox"
                    checked={vinculados.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-sm text-[var(--fg)]">{c.nome}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
