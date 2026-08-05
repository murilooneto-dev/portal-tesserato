'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { excluirClientePessoal, desabilitarCliente, reabilitarCliente } from '@/app/pessoal/clientes/actions'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
import EmpresaPessoalModal from './EmpresaPessoalModal'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'

interface Props {
  cliente: ClienteComPessoal
  responsaveis: string[]
  tarefasPadrao: string[]
}

export default function ClientePessoalAcoes({ cliente, responsaveis, tarefasPadrao }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [confirmandoReabilitar, setConfirmandoReabilitar] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)

  async function handleReabilitar() {
    setReabilitando(true)
    try {
      await reabilitarCliente(cliente.id)
      router.refresh()
    } finally {
      setReabilitando(false)
      setConfirmandoReabilitar(false)
    }
  }

  async function handleExcluir() {
    setExcluindo(true)
    try {
      await excluirClientePessoal(cliente.id)
      router.push('/pessoal/clientes')
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
          <span className="text-xs text-red-400">Remover do Pessoal?</span>
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

      {cliente.ativo ? (
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
        </>
      )}

      {editando && (
        <EmpresaPessoalModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
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
