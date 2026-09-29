'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import { excluirCliente } from '@/app/fiscal/clientes/actions'
import EmpresaModal from './EmpresaModal'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

interface Props {
  cliente: ClienteComFiscal
  responsaveis: string[]
  catalogo: CatalogoCliente
}

export default function ClienteAcoes({ cliente, responsaveis, catalogo }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const router = useRouter()

  // Excluir pelo Fiscal apaga o cliente de TODOS os setores; o modal avisa
  // quais outros setores também perdem dados.
  const impacto = descreverImpactoExclusao({
    origem: 'fiscal', acao: 'excluir-do-sistema', setoresDoCliente: cliente.setores ?? [],
  })

  async function handleExcluir() {
    const r = await excluirCliente(cliente.id)
    if (!r.error) router.push('/fiscal/clientes')
    return r
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setModalOpen(true)}
          className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all">
          Editar
        </button>
        <button
          onClick={() => setConfirmandoExclusao(true)}
          className="text-xs text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all">
          Excluir
        </button>
        {cliente.ativo === false && (
          <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
            Desabilitado
          </span>
        )}
      </div>

      {modalOpen && (
        <EmpresaModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          catalogo={catalogo}
          onClose={() => setModalOpen(false)}
        />
      )}

      {confirmandoExclusao && (
        <ConfirmarExclusaoClienteModal
          nomeCliente={cliente.nome}
          impacto={impacto}
          onConfirmar={handleExcluir}
          onCancelar={() => setConfirmandoExclusao(false)}
        />
      )}

    </>
  )
}
