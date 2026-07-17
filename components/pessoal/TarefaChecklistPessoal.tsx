'use client'

import { useTransition, useState } from 'react'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta } from '@/lib/types'
import type { VinculoStatus } from '@/lib/vinculos'
import { tarefaVisivelNoMes } from '@/lib/tarefa-tipos'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface TipoInfo {
  etapas: string[] | null
  mesesVisiveis: number[] | null
  tipoResposta: TipoResposta
}

interface Props {
  tarefasPersonalizadas: string[]
  tarefaTipos: Record<string, TipoInfo>
  tarefas: Tarefa[]
  etapas: TarefaEtapa[]
  arquivos: Omit<TarefaArquivo, 'content_base64'>[]
  vinculos?: Record<string, VinculoStatus>
  mes: number
  ano: number
  onToggleSimples: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
  onSalvarTexto: (tipo: string, texto: string) => Promise<void>
  onUploadArquivo: (tipo: string, formData: FormData) => Promise<{ error: string | null }>
  onExcluirArquivo: (arquivoId: string) => Promise<void>
  podeEditar: boolean
}

function isoParaDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayParaIso(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (parseInt(y, 10) < 1000) return null
  const iso = `${y}-${m}-${d}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return iso
}

function autoFormatarData(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return digits
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TarefaChecklistPessoal({
  tarefasPersonalizadas,
  tarefaTipos,
  tarefas,
  etapas,
  arquivos,
  vinculos = {},
  mes,
  ano,
  onToggleSimples,
  onAtualizarEtapa,
  onSalvarTexto,
  onUploadArquivo,
  onExcluirArquivo,
  podeEditar,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [localText, setLocalText] = useState<Record<string, string>>({})
  const [localResposta, setLocalResposta] = useState<Record<string, string>>({})
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})

  const tarefasVisiveis = tarefasPersonalizadas.filter(tipo => tarefaVisivelNoMes(tarefaTipos[tipo]?.mesesVisiveis, mes))

  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tarefasVisiveis.length
  const concluidas = tarefasVisiveis.filter(t => mapaTarefa.get(t)?.concluida).length

  function etapasDaTarefa(tipo: string): TarefaEtapa[] {
    const tarefaId = mapaTarefa.get(tipo)?.id
    if (!tarefaId) return []
    return etapas.filter(e => e.tarefa_id === tarefaId)
  }

  function arquivosDaTarefa(tipo: string): Omit<TarefaArquivo, 'content_base64'>[] {
    const tarefaId = mapaTarefa.get(tipo)?.id
    if (!tarefaId) return []
    return arquivos.filter(a => a.tarefa_id === tarefaId)
  }

  function keyLocal(tipo: string, etapaNome?: string) {
    return etapaNome ? `${tipo}::${etapaNome}` : tipo
  }

  function getSavedIso(tipo: string, etapaNome?: string): string {
    if (etapaNome) {
      const e = etapasDaTarefa(tipo).find(e => e.nome === etapaNome)
      return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : ''
    }
    const t = mapaTarefa.get(tipo)
    return t?.concluida && t.concluida_em ? t.concluida_em.slice(0, 10) : ''
  }

  function getDisplayValue(tipo: string, etapaNome?: string): string {
    const key = keyLocal(tipo, etapaNome)
    if (key in localText) return localText[key]
    return isoParaDisplay(getSavedIso(tipo, etapaNome))
  }

  function handleTextChange(tipo: string, raw: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const formatted = autoFormatarData(raw)
    setLocalText(prev => ({ ...prev, [key]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, true, iso)
        else onToggleSimples(tipo, true, iso)
      })
    }
  }

  function handleTextBlur(tipo: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const val = localText[key]
    if (val === undefined) return
    if (val === '') {
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, false)
        else onToggleSimples(tipo, false)
      })
    }
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function getRespostaTexto(tipo: string): string {
    if (tipo in localResposta) return localResposta[tipo]
    return mapaTarefa.get(tipo)?.resposta_texto ?? ''
  }

  function handleRespostaTextoChange(tipo: string, valor: string) {
    setLocalResposta(prev => ({ ...prev, [tipo]: valor }))
  }

  function handleRespostaTextoBlur(tipo: string) {
    const valor = localResposta[tipo]
    if (valor === undefined) return
    startTransition(() => { onSalvarTexto(tipo, valor) })
    setLocalResposta(prev => { const n = { ...prev }; delete n[tipo]; return n })
  }

  async function handleUploadArquivo(tipo: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingTipo(tipo)
    setErroUpload(prev => { const n = { ...prev }; delete n[tipo]; return n })
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('arquivo', file)
        const result = await onUploadArquivo(tipo, formData)
        if (result.error) setErroUpload(prev => ({ ...prev, [tipo]: result.error! }))
      }
    } finally {
      setUploadingTipo(null)
    }
  }

  function handleExcluirArquivo(arquivoId: string) {
    startTransition(() => { onExcluirArquivo(arquivoId) })
  }

  const inputCls = (feito: boolean) => `text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
    feito
      ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
      : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
  }`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
          Tarefas — {MESES[mes - 1]}/{ano}
        </h3>
        <span className="text-xs text-[var(--fg)]/40">{concluidas}/{total}</span>
      </div>

      <div className="w-full h-1.5 bg-[var(--fg)]/8 rounded-full mb-5">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tarefasVisiveis.map(tipo => {
          const info = tarefaTipos[tipo]
          const etapasDefinidas = info?.etapas ?? null
          const tipoResposta: TipoResposta = info?.tipoResposta ?? 'data'
          const feito = !!mapaTarefa.get(tipo)?.concluida
          const displayVal = getDisplayValue(tipo)

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                feito ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/15'}`} />
                <span className={`text-sm flex-1 transition-colors ${feito ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>
                  {tipo}
                  {vinculos[tipo] && (
                    <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      vinculos[tipo].liberada
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {vinculos[tipo].liberada
                        ? `✓ Liberada por ${vinculos[tipo].setorOrigemLabel}`
                        : `⏳ Aguardando ${vinculos[tipo].setorOrigemLabel}`}
                    </span>
                  )}
                </span>

                {tipoResposta === 'data' && !etapasDefinidas && (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={inputCls(feito)}
                  />
                )}
              </div>

              {etapasDefinidas && (
                <div className="ml-5 mt-1 grid grid-cols-2 gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                  {etapasDefinidas.map(etapaNome => {
                    const etapaFeita = !!etapasDaTarefa(tipo).find(e => e.nome === etapaNome)?.concluida
                    const etapaDisplay = getDisplayValue(tipo, etapaNome)
                    return (
                      <div key={etapaNome} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--fg)]/60">{etapaNome}</span>
                        <input
                          type="text"
                          value={etapaDisplay}
                          onChange={e => handleTextChange(tipo, e.target.value, etapaNome)}
                          onBlur={() => handleTextBlur(tipo, etapaNome)}
                          disabled={!podeEditar || isPending}
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                          className={inputCls(etapaFeita)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {tipoResposta === 'texto' && !etapasDefinidas && (
                <div className="ml-5 mt-1 flex flex-col gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                  <textarea
                    value={getRespostaTexto(tipo)}
                    onChange={e => handleRespostaTextoChange(tipo, e.target.value)}
                    onBlur={() => handleRespostaTextoBlur(tipo)}
                    disabled={!podeEditar || isPending}
                    placeholder="Digite a resposta..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50 disabled:opacity-40"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {podeEditar && (
                      <label className={`text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                        uploadingTipo === tipo
                          ? 'opacity-50 pointer-events-none'
                          : 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25'
                      }`}>
                        {uploadingTipo === tipo ? 'Enviando...' : '+ Anexar'}
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                          multiple
                          className="hidden"
                          onChange={e => handleUploadArquivo(tipo, e.target.files)}
                          disabled={isPending}
                        />
                      </label>
                    )}
                    {arquivosDaTarefa(tipo).map(arq => (
                      <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                        📎 {arq.name} · {formatBytes(arq.size)}
                        {podeEditar && (
                          <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                            className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                        )}
                      </span>
                    ))}
                  </div>
                  {erroUpload[tipo] && <p className="text-red-400 text-[10px]">{erroUpload[tipo]}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
