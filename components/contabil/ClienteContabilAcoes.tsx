'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { excluirClienteContabil, desabilitarCliente, reabilitarCliente } from '@/app/contabil/clientes/actions'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
import EmpresaContabilModal from './EmpresaContabilModal'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

interface Props {
  cliente: ClienteComContabil
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
}

export default function ClienteContabilAcoes({ cliente, responsaveis, tarefasPadrao, catalogo }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [confirmandoReabilitar, setConfirmandoReabilitar] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)
  const [erroReabilitar, setErroReabilitar] = useState<string | null>(null)

  async function handleReabilitar() {
    setReabilitando(true)
    setErroReabilitar(null)
    try {
      const resultado = await reabilitarCliente(cliente.id)
      if (resultado.error) {
        setErroReabilitar(resultado.error)
        return
      }
      router.refresh()
      setConfirmandoReabilitar(false)
    } finally {
      setReabilitando(false)
    }
  }

  async function handleExcluir() {
    setExcluindo(true)
    try {
      await excluirClienteContabil(cliente.id)
      router.push('/contabil/clientes')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
        Editar
      </button>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Remover do Contábil?</span>
          <button onClick={handleExcluir} disabled={excluindo}
            className="text-xs bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
            {excluindo ? 'Removendo...' : 'Confirmar'}
          </button>
          <button onClick={() => setConfirmando(false)}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-2 py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
          Excluir
        </button>
      )}

      {cliente.ativo !== false ? (
        <button
          onClick={() => setDesabilitarModalOpen(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-amber-400/70 hover:text-amber-400 px-3 py-1.5 rounded-lg transition-all">
          Desabilitar
        </button>
      ) : (
        <>
          <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
            Desabilitado
          </span>
          {confirmandoReabilitar ? (
            <button onClick={handleReabilitar} disabled={reabilitando}
              className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
              {reabilitando ? 'Reabilitando...' : 'Confirmar'}
            </button>
          ) : (
            <button
              onClick={() => setConfirmandoReabilitar(true)}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-emerald-400/70 hover:text-emerald-400 px-3 py-1.5 rounded-lg transition-all">
              Reabilitar
            </button>
          )}
          {erroReabilitar && <p className="text-red-400 text-xs">{erroReabilitar}</p>}
        </>
      )}

      {editando && (
        <EmpresaContabilModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setEditando(false)}
        />
      )}

      {desabilitarModalOpen && (
        <DesabilitarClienteModal
          clienteNome={cliente.nome}
          onClose={() => setDesabilitarModalOpen(false)}
          onConfirm={senha => desabilitarCliente(cliente.id, senha)}
          onConfirmado={() => router.refresh()}
        />
      )}
    </div>
  )
}
