'use client'

import { useState, useTransition } from 'react'
import { toggleTarefaAvulsa, excluirTarefaAvulsa, uploadArquivoEvento, excluirArquivoEvento, type TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import EventoAvulsoModal from './EventoAvulsoModal'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
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

export default function EventosAvulsosSecao({ clienteId, setor, eventos, podeEditar }: Props) {
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

  return (
    <div className="mt-8 pt-6 border-t border-[var(--fg)]/8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">Eventos do mês</h3>
        {podeEditar && (
          <button onClick={() => setModalAberto(true)}
            className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 px-3 py-1.5 rounded-lg transition-all font-semibold">
            + Evento
          </button>
        )}
      </div>

      {eventos.length === 0 ? (
        <p className="text-[var(--fg)]/25 text-xs py-2">Nenhum evento avulso neste mês.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {eventos.map(ev => (
            <div key={ev.id} className={`flex flex-col gap-2 px-3 py-2.5 rounded-xl border transition-all ${
              ev.concluida ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
            }`}>
              <div className="flex items-start gap-3">
                <button onClick={() => handleToggle(ev.id, !ev.concluida)} disabled={!podeEditar || isPending}
                  className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 transition-colors disabled:opacity-40 ${
                    ev.concluida ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--fg)]/25'
                  }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${ev.concluida ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>{ev.titulo}</p>
                  {ev.descricao && <p className="text-xs text-[var(--fg)]/40 mt-0.5">{ev.descricao}</p>}
                  <p className="text-[10px] text-[var(--fg)]/25 mt-1">
                    {formatarData(ev.data)} · criado por {ev.criado_por_nome ?? 'desconhecido'}
                  </p>
                </div>
                {podeEditar && (
                  excluindoId === ev.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleExcluir(ev.id)}
                        className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-1 rounded-md">Confirmar</button>
                      <button onClick={() => setExcluindoId(null)}
                        className="text-[10px] text-[var(--fg)]/40 px-1">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => setExcluindoId(ev.id)}
                      className="text-[var(--fg)]/25 hover:text-red-400 text-xs shrink-0 transition-colors">×</button>
                  )
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap ml-7">
                {podeEditar && (
                  <label className={`text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                    uploadingId === ev.id
                      ? 'opacity-50 pointer-events-none'
                      : 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25'
                  }`}>
                    {uploadingId === ev.id ? 'Enviando...' : '+ Anexo'}
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                      multiple
                      className="hidden"
                      onChange={e => handleUploadArquivo(ev.id, e.target.files)}
                      disabled={isPending}
                    />
                  </label>
                )}
                {ev.arquivos.map(arq => (
                  <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                    <a href={`/api/arquivos/evento/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      📎 {arq.name}
                    </a>
                    · {formatBytes(arq.size)}
                    {podeEditar && (
                      <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                        className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                    )}
                  </span>
                ))}
              </div>
              {erroUpload[ev.id] && <p className="text-red-400 text-[10px] ml-7">{erroUpload[ev.id]}</p>}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <EventoAvulsoModal clienteId={clienteId} setor={setor} onClose={() => setModalAberto(false)} />
      )}
    </div>
  )
}
