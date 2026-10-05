'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import { excluirCliente } from '@/app/fiscal/clientes/actions'
import EmpresaModal from './EmpresaModal'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { Button } from '@/components/ui/Button'

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
      <div className="flex flex-wrap items-center gap-2">
        <Button icone={<Pencil size={16} aria-hidden="true" />} onClick={() => setModalOpen(true)}>Editar</Button>
        <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmandoExclusao(true)}>Excluir</Button>
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
