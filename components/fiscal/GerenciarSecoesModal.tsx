'use client'

import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  criarSecaoParcelamento, renomearSecaoParcelamento, removerSecaoParcelamento,
} from '@/lib/parcelamento-secoes-actions'
import { Modal } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { useConfirmar } from '@/components/ui/ConfirmDialog'

interface SecaoParcelamento {
  id: string
  nome: string
}

interface Props {
  secoes: SecaoParcelamento[]
  onClose: () => void
  onChanged: () => void
}

export default function GerenciarSecoesModal({ secoes, onClose, onChanged }: Props) {
  const confirmar = useConfirmar()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const ocupado = busyId !== null || criando

  function startEdit(s: SecaoParcelamento) {
    setEditingId(s.id)
    setEditValue(s.nome)
    setErro(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setErro(null)
  }

  async function salvarEdicao(s: SecaoParcelamento) {
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await renomearSecaoParcelamento(s.id, editValue)
      if (error) { setErro(error); return }
      setEditingId(null)
      setEditValue('')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function remover(s: SecaoParcelamento) {
    const ok = await confirmar({
      titulo: 'Remover seção?',
      descricao: `Remover a seção "${s.nome}"?`,
      textoConfirmar: 'Remover',
      perigo: true,
    })
    if (!ok) return
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await removerSecaoParcelamento(s.id)
      if (error) { setErro(error); return }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    setErro(null)
    setCriando(true)
    try {
      const { error } = await criarSecaoParcelamento(nome)
      if (error) { setErro(error); return }
      setNovoNome('')
      onChanged()
    } finally {
      setCriando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={ocupado}
      largura="p"
      titulo="Gerenciar seções"
      subtitulo="As seções agrupam os parcelamentos na lista."
      rodape={<Button className="ml-auto" onClick={onClose} disabled={ocupado}>Fechar</Button>}
    >
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <ul className="flex flex-col gap-2">
        {secoes.map(s => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line-soft bg-inset px-3 py-2">
            {editingId === s.id ? (
              <>
                <Input
                  aria-label={`Novo nome da seção ${s.nome}`}
                  data-autofocus
                  className="flex-1"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); if (editValue.trim()) salvarEdicao(s) }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit() }
                  }}
                />
                <IconButton rotulo="Salvar nome" icone={<Check size={16} aria-hidden="true" />} onClick={() => salvarEdicao(s)} disabled={busyId === s.id || !editValue.trim()} />
                <IconButton rotulo="Cancelar edição" icone={<X size={16} aria-hidden="true" />} onClick={cancelEdit} disabled={busyId === s.id} />
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.nome}</span>
                <IconButton rotulo={`Renomear ${s.nome}`} icone={<Pencil size={16} aria-hidden="true" />} onClick={() => startEdit(s)} disabled={ocupado} />
                <IconButton rotulo={`Remover ${s.nome}`} icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => remover(s)} disabled={ocupado} />
              </>
            )}
          </li>
        ))}
        {secoes.length === 0 && (
          <li className="py-4 text-center text-sm text-fg-3">Nenhuma seção cadastrada.</li>
        )}
      </ul>

      <div className="flex items-center gap-2 border-t border-line-soft pt-4">
        <Input
          aria-label="Nome da nova seção"
          className="flex-1"
          placeholder="Nome da nova seção"
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar() } }}
        />
        <Button icone={<Plus size={16} aria-hidden="true" />} onClick={criar} carregando={criando} disabled={!novoNome.trim() || busyId !== null}>
          {criando ? 'Criando…' : 'Criar seção'}
        </Button>
      </div>
    </Modal>
  )
}
