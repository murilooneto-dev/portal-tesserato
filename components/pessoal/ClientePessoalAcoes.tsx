'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { excluirClientePessoal } from '@/app/pessoal/clientes/actions'
import EmpresaPessoalModal from './EmpresaPessoalModal'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

interface Props {
  cliente: ClienteComPessoal
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
}

export default function ClientePessoalAcoes({ cliente, responsaveis, tarefasPadrao, catalogo }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // "Excluir" aqui tira o cliente do setor; se ele não estiver em mais nenhum,
  // apaga o cliente do sistema inteiro. O modal avisa qual dos dois casos é.
  const impacto = descreverImpactoExclusao({
    origem: 'pessoal', acao: 'remover-do-setor', setoresDoCliente: cliente.setores ?? [],
  })

  async function handleExcluir() {
    const r = await excluirClientePessoal(cliente.id)
    if (!r.error) router.push('/pessoal/clientes')
    return r
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
        Editar
      </button>

      <button onClick={() => setConfirmando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
        Excluir
      </button>

      {cliente.ativo === false && (
        <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
          Desabilitado
        </span>
      )}

      {editando && (
        <EmpresaPessoalModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setEditando(false)}
        />
      )}

      {confirmando && (
        <ConfirmarExclusaoClienteModal
          nomeCliente={cliente.nome}
          impacto={impacto}
          onConfirmar={handleExcluir}
          onCancelar={() => setConfirmando(false)}
        />
      )}

    </div>
  )
}
