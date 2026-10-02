'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Upload, X } from 'lucide-react'
import { criarTarefaAvulsa, uploadArquivoEvento } from '@/lib/tarefas-avulsas'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  onClose: () => void
}

export default function EventoAvulsoModal({ clienteId, setor, onClose }: Props) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Preenchido quando o evento já foi criado mas algum anexo falhou: a janela
  // fica aberta e uma nova tentativa só reenvia os anexos que faltam.
  const [eventoCriadoId, setEventoCriadoId] = useState<string | null>(null)

  function handleSelecionarArquivos(files: FileList | null) {
    if (!files) return
    setArquivos(prev => [...prev, ...Array.from(files)])
  }

  function handleRemoverArquivoSelecionado(idx: number) {
    setArquivos(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!eventoCriadoId && (!titulo.trim() || !data)) { setErro('Título e data são obrigatórios.'); return }
    setSaving(true)
    setErro(null)

    let eventoId = eventoCriadoId
    if (!eventoId) {
      const resultado = await criarTarefaAvulsa({ clienteId, setor, titulo: titulo.trim(), descricao: descricao.trim() || null, data })
      if ('error' in resultado) {
        setSaving(false)
        setErro(resultado.error)
        return
      }
      eventoId = resultado.id
      setEventoCriadoId(eventoId)
    }

    const falharam: File[] = []
    const erros: string[] = []
    for (const arquivo of arquivos) {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const uploadResult = await uploadArquivoEvento(eventoId, clienteId, setor, formData)
      if (uploadResult.error) {
        falharam.push(arquivo)
        erros.push(`${arquivo.name}: ${uploadResult.error}`)
      }
    }

    setSaving(false)
    router.refresh()
    if (falharam.length > 0) {
      setArquivos(falharam)
      setErro(`O evento foi criado, mas ${falharam.length === 1 ? 'um anexo não foi enviado' : `${falharam.length} anexos não foram enviados`}. ${erros.join(' · ')}`)
      return
    }
    onClose()
  }

  const evento = eventoCriadoId !== null

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo="Novo evento"
      largura="p"
      bloqueado={saving}
      rodape={
        <div className="ml-auto flex gap-2.5">
          <Button variante="fantasma" onClick={onClose} disabled={saving}>{evento ? 'Fechar' : 'Cancelar'}</Button>
          <Button variante="primario" onClick={handleSave} carregando={saving} disabled={!evento && (!titulo.trim() || !data)}>
            {saving ? 'Salvando...' : evento ? 'Reenviar anexos' : 'Salvar evento'}
          </Button>
        </div>
      }
    >
      <Field rotulo="Título" obrigatorio>
        {c => (
          <Input id={c.id} aria-describedby={c.describedBy} value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Ex.: Reunião de fechamento" disabled={evento} data-autofocus="" />
        )}
      </Field>

      <Field rotulo="Descrição">
        {c => (
          <Textarea id={c.id} aria-describedby={c.describedBy} rows={2} value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Opcional" disabled={evento} />
        )}
      </Field>

      <Field rotulo="Data" obrigatorio>
        {c => (
          <Input id={c.id} aria-describedby={c.describedBy} type="date" value={data} onChange={e => setData(e.target.value)}
            disabled={evento} className="sm:w-56" />
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg-2">Anexos</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc">
            <Upload size={14} aria-hidden="true" />
            Escolher arquivos
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
              multiple
              className="sr-only"
              onChange={e => { handleSelecionarArquivos(e.target.files); e.target.value = '' }}
            />
          </label>
          {arquivos.map((arq, idx) => (
            <span key={`${arq.name}-${idx}`} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[7px] border border-line-soft bg-surface px-2 text-xs text-fg-2">
              <Paperclip size={12} aria-hidden="true" className="flex-none" />
              {arq.name}
              <button type="button" aria-label={`Tirar ${arq.name}`} onClick={() => handleRemoverArquivoSelecionado(idx)}
                className="grid h-6 w-6 place-items-center rounded text-fg-3 hover:text-danger">
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <p className="text-xs text-fg-3">PDF, imagem, Excel ou Word</p>
      </div>

      {erro && <Aviso tom="dng"><span role="alert">{erro}</span></Aviso>}
    </Modal>
  )
}
