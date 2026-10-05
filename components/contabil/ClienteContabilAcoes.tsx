'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Pencil, Trash2, Unlock } from 'lucide-react'
import { excluirClienteContabil } from '@/app/contabil/clientes/actions'
import { desabilitarClienteGeral, reabilitarClienteGeral } from '@/app/(comum)/clientes/actions'
import EmpresaContabilModal from './EmpresaContabilModal'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
import MenuMaisAcoes, { type ItemMenu } from '@/components/geral/MenuMaisAcoes'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { Button } from '@/components/ui/Button'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

interface Props {
  cliente: ClienteComContabil
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  // Desabilitar/reabilitar vale para a empresa em todos os setores: só Admin e
  // Societário (mesma regra do Cadastro de clientes e da action).
  podeDesabilitar?: boolean
}

export default function ClienteContabilAcoes({ cliente, responsaveis, tarefasPadrao, catalogo, podeDesabilitar = false }: Props) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const toast = useToast()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [desabilitando, setDesabilitando] = useState(false)

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

  async function handleReabilitar() {
    if (!(await confirmar({ titulo: 'Reabilitar cliente?', descricao: `"${cliente.nome}" volta a aparecer nos setores onde estava desabilitado.`, textoConfirmar: 'Reabilitar' }))) return
    const { error } = await reabilitarClienteGeral(cliente.id)
    if (error) { toast(error, 'dng'); return }
    router.refresh()
  }

  const itens: ItemMenu[] = []
  if (podeDesabilitar) {
    itens.push(cliente.ativo === false
      ? { rotulo: 'Reabilitar', icone: <Unlock size={16} aria-hidden="true" />, onSelecionar: handleReabilitar }
      : { rotulo: 'Desabilitar', icone: <Lock size={16} aria-hidden="true" />, onSelecionar: () => setDesabilitando(true) })
  }
  itens.push({ rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => setConfirmando(true) })

  return (
    <div className="flex items-center gap-2.5">
      <Button icone={<Pencil size={16} aria-hidden="true" />} onClick={() => setEditando(true)} className="max-sm:h-11">Editar dados</Button>
      <MenuMaisAcoes rotulo={podeDesabilitar ? 'Mais ações: desabilitar, excluir' : 'Mais ações: excluir'} itens={itens} />

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

      {desabilitando && (
        <DesabilitarClienteModal
          clienteNome={cliente.nome}
          onClose={() => setDesabilitando(false)}
          onConfirm={senha => desabilitarClienteGeral(cliente.id, senha)}
          onConfirmado={() => router.refresh()}
        />
      )}
    </div>
  )
}
