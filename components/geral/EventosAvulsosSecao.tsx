'use client'

import { useState, useTransition } from 'react'
import { toggleTarefaAvulsa, excluirTarefaAvulsa, uploadArquivoEvento, excluirArquivoEvento, type TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import { Paperclip, Plus, X, CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { MESES } from '@/lib/mes-navegacao'
import EventoAvulsoModal from './EventoAvulsoModal'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
  // Sem a margem/borda de separação de cima — usado quando o cliente já é
  // o próprio cabeçalho da seção (ex: visão consolidada de eventos).
  compacto?: boolean
  /** Mês mostrado (1–12), para o vazio dizer "em setembro"; sem ele, "neste mês". */
  mes?: number
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EventosAvulsosSecao({ clienteId, setor, eventos, podeEditar, compacto, mes }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleToggle(id: string, concluida: boolean) {
    startTransition(() => { toggleTarefaAvulsa(id, clienteId, setor, concluida) })
  }

  function handleExcluir(id: string) {
    startTransition(() => { excluirTarefaAvulsa(id, clienteId, setor) })
    setExcluindoId(null)
  }

  async function handleUploadArquivo(eventoId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingId(eventoId)
    setErroUpload(prev => { const n = { ...prev }; delete n[eventoId]; return n })
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('arquivo', file)
        const result = await uploadArquivoEvento(eventoId, clienteId, setor, formData)
        if (result.error) setErroUpload(prev => ({ ...prev, [eventoId]: result.error! }))
      }
    } finally {
      setUploadingId(null)
    }
  }

  function handleExcluirArquivo(arquivoId: string) {
    startTransition(() => { excluirArquivoEvento(arquivoId, clienteId, setor) })
  }

  const novoEvento = podeEditar ? (
    <Button variante="secundario" tamanho="p" icone={<Plus size={14} aria-hidden="true" />} onClick={() => setModalAberto(true)}>
      Novo evento
    </Button>
  ) : undefined

  const noMes = mes ? `em ${MESES[mes - 1].toLowerCase()}` : 'neste mês'

  const lista = eventos.length === 0 ? (
    compacto
      ? <p className="py-2 text-[13px] text-fg-3">Nenhum evento avulso {noMes}.</p>
      : <EmptyState
          compacto
          icone={<CalendarDays size={20} />}
          titulo={`Nenhum evento avulso ${noMes}`}
          descricao="Registre aqui compromissos pontuais deste cliente no mês."
        />
  ) : (
    <ul className="flex flex-col gap-2">
      {eventos.map(ev => (
        <li key={ev.id} className={`flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 ${
          ev.concluida ? 'border-acc/30 bg-acc-soft' : 'border-line-soft bg-raised'
        }`}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Checkbox
                checked={ev.concluida}
                onChange={() => handleToggle(ev.id, !ev.concluida)}
                disabled={!podeEditar || isPending}
                rotulo={<span className={ev.concluida ? 'text-fg-3 line-through' : 'font-medium text-fg'}>{ev.titulo}</span>}
              />
              {ev.descricao && <p className="mt-1 pl-7 text-[13px] text-fg-2">{ev.descricao}</p>}
              <p className="mt-1 pl-7 text-xs text-fg-3">
                {formatarData(ev.data)} · criado por {ev.criado_por_nome ?? 'desconhecido'}
              </p>
            </div>
            {podeEditar && (
              excluindoId === ev.id ? (
                <div className="flex flex-none items-center gap-1.5">
                  <Button variante="perigo-solido" tamanho="p" onClick={() => handleExcluir(ev.id)}>Confirmar</Button>
                  <Button variante="fantasma" tamanho="p" onClick={() => setExcluindoId(null)}>Cancelar</Button>
                </div>
              ) : (
                <IconButton rotulo={`Excluir evento ${ev.titulo}`} icone={<X size={16} aria-hidden="true" />} onClick={() => setExcluindoId(ev.id)} />
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-7">
            {podeEditar && (
              <label className={`inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc ${
                uploadingId === ev.id ? 'pointer-events-none opacity-45' : ''
              }`}>
                <Paperclip size={14} aria-hidden="true" />
                {uploadingId === ev.id ? 'Enviando...' : 'Anexo'}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                  multiple
                  className="sr-only"
                  onChange={e => handleUploadArquivo(ev.id, e.target.files)}
                  disabled={isPending}
                />
              </label>
            )}
            {ev.arquivos.map(arq => (
              <span key={arq.id} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[7px] border border-line-soft bg-surface px-2 text-xs text-fg-2">
                <Paperclip size={12} aria-hidden="true" className="flex-none" />
                <a href={`/api/arquivos/evento/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {arq.name}
                </a>
                · {formatBytes(arq.size)}
                {podeEditar && (
                  <button type="button" aria-label={`Remover anexo ${arq.name}`} onClick={() => handleExcluirArquivo(arq.id)}
                    className="grid h-6 w-6 max-sm:h-11 max-sm:w-11 place-items-center rounded text-fg-3 hover:text-danger">
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {erroUpload[ev.id] && <p role="alert" className="pl-7 text-xs text-danger">{erroUpload[ev.id]}</p>}
        </li>
      ))}
    </ul>
  )

  const modal = modalAberto && (
    <EventoAvulsoModal clienteId={clienteId} setor={setor} onClose={() => setModalAberto(false)} />
  )

  if (compacto) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg-2">Eventos do mês</h3>
          {novoEvento}
        </div>
        {lista}
        {modal}
      </div>
    )
  }

  return (
    <Card titulo="Eventos do mês" acoes={novoEvento} semPadding={eventos.length === 0}>
      {lista}
      {modal}
    </Card>
  )
}
