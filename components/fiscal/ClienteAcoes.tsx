'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Cliente } from '@/lib/types'
import { excluirCliente } from '@/app/fiscal/clientes/actions'
import EmpresaModal from './EmpresaModal'

interface Props {
  cliente: Cliente
  responsaveis: string[]
  templates: Record<string, string[]>
}

export default function ClienteAcoes({ cliente, responsaveis, templates }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [palavraDigitada, setPalavraDigitada] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const router = useRouter()

  const confirmacaoValida = nomeDigitado.trim() === cliente.nome && palavraDigitada.trim().toUpperCase() === 'DELETAR'

  function abrirConfirmacao() {
    setNomeDigitado('')
    setPalavraDigitada('')
    setConfirmandoExclusao(true)
  }

  async function handleExcluir() {
    if (!confirmacaoValida) return
    setExcluindo(true)
    try {
      await excluirCliente(cliente.id)
      router.push('/fiscal/clientes')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setModalOpen(true)}
          className="text-xs text-white/40 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all">
          Editar
        </button>
        <button
          onClick={abrirConfirmacao}
          className="text-xs text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all">
          Excluir
        </button>
      </div>

      {modalOpen && (
        <EmpresaModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          templates={templates}
          onClose={() => setModalOpen(false)}
        />
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={e => e.target === e.currentTarget && setConfirmandoExclusao(false)}>
          <div className="bg-[#162444] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-white font-bold text-base mb-1">Excluir cliente</h2>
            <p className="text-white/50 text-sm mb-4">
              Esta ação não pode ser desfeita. Pra confirmar, digite o nome do cliente e a palavra <span className="text-red-400 font-semibold">DELETAR</span> abaixo.
            </p>

            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
              Nome do cliente: <span className="text-white/60 normal-case">{cliente.nome}</span>
            </label>
            <input
              type="text"
              value={nomeDigitado}
              onChange={e => setNomeDigitado(e.target.value)}
              placeholder="Digite o nome exatamente como acima"
              className="w-full mb-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-500/50"
            />

            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
              Digite DELETAR
            </label>
            <input
              type="text"
              value={palavraDigitada}
              onChange={e => setPalavraDigitada(e.target.value)}
              placeholder="DELETAR"
              className="w-full mb-5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-500/50"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="text-xs text-white/40 hover:text-white px-4 py-2 rounded-lg border border-white/10 transition-all">
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={!confirmacaoValida || excluindo}
                className="text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-40">
                {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
