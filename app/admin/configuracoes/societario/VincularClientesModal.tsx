// app/admin/configuracoes/societario/VincularClientesModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import {
  listarClientesParaVinculo,
  listarClienteIdsVinculados,
  alternarVinculoCliente,
  type ClienteResumo,
} from '@/lib/tarefa-tipo-vinculos-societario-actions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { cn } from '@/components/ui/cn'

interface Props {
  tarefaTipoId: string
  tarefaTipoNome: string
  onClose: () => void
}

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
      if (jaVinculado) novo.delete(clienteId)
      else novo.add(clienteId)
      return novo
    })

    const { error } = await alternarVinculoCliente(tarefaTipoId, clienteId, !jaVinculado)
    if (error) {
      setErro(error)
      setVinculados(prev => {
        const novo = new Set(prev)
        if (jaVinculado) novo.add(clienteId)
        else novo.delete(clienteId)
        return novo
      })
    }
  }

  const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={`Clientes de "${tarefaTipoNome}"`}
      largura="p"
      rodape={<Button variante="fantasma" onClick={onClose} className="ml-auto">Fechar</Button>}
    >
      <Input
        aria-label="Buscar cliente"
        placeholder="Buscar cliente"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        iconeEsquerda={<Search size={16} />}
      />

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      {carregando ? (
        <p className="text-sm text-fg-3">Carregando…</p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="text-sm text-fg-3">Nenhum cliente encontrado.</p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto rounded-[10px] border border-line-soft">
          {clientesFiltrados.map((c, i) => {
            const marcado = vinculados.has(c.id)
            return (
              <li key={c.id} className={cn('flex min-h-11 items-center px-3.5', i > 0 && 'border-t border-line-soft')}>
                <Checkbox
                  rotulo={<span className="text-sm text-fg">{c.nome}</span>}
                  checked={marcado}
                  onChange={() => toggle(c.id)}
                  className="w-full py-2"
                />
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-[13px] text-fg-3">
        Vincular agora não cria pendências de meses/períodos passados — só a partir do período atual.
      </p>
    </Modal>
  )
}
