'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { excluirClienteContabil } from '@/app/contabil/clientes/actions'
import EmpresaContabilModal from './EmpresaContabilModal'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
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

  // "Excluir" aqui tira o cliente do setor; se ele não estiver em mais nenhum,
  // apaga o cliente do sistema inteiro. O modal avisa qual dos dois casos é.
  const impacto = descreverImpactoExclusao({
    origem: 'contabil', acao: 'remover-do-setor', setoresDoCliente: cliente.setores ?? [],
  })

  async function handleExcluir() {
    const r = await excluirClienteContabil(cliente.id)
    if (!r.error) router.push('/contabil/clientes')
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
        <EmpresaContabilModal
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
