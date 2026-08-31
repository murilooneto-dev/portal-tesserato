'use client'

import { useTransition, useState } from 'react'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta } from '@/lib/types'
import type { VinculoStatus } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import { desbloquearTarefa, salvarMIT } from '@/app/fiscal/clientes/actions'
import { normalizarTitulo, alertaLabel } from '@/lib/calendario'
import { isoParaDisplay, displayParaIso, autoFormatarData } from '@/lib/data-checklist'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface TipoInfo {
  etapas: string[] | null
  tipoResposta: TipoResposta
}

interface Props {
  clienteId: string
  clienteNome: string
  grupo: string
  tarefasPersonalizadas?: string[]
  tarefas: Tarefa[]
  vinculos?: Record<string, VinculoStatus>
  mes: number
  ano: number
  usuarioId: string
  usuarioNome: string
  mitInicial?: string
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onOptimisticUnlock?: (tipo: string) => void
  podeEditar: boolean
  podeEditarPorTipo?: Record<string, boolean>
  tarefaTipos?: Record<string, TipoInfo>
  etapas?: TarefaEtapa[]
  arquivos?: Omit<TarefaArquivo, 'content_base64'>[]
  prazosPorTipo?: Record<string, number>
  onAtualizarEtapa?: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
  onSalvarTexto?: (tipo: string, texto: string) => Promise<void>
  onUploadArquivo?: (tipo: string, formData: FormData) => Promise<{ error: string | null }>
  onExcluirArquivo?: (arquivoId: string) => Promise<void>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TarefaChecklist({
  clienteId,
  clienteNome,
  grupo,
  tarefasPersonalizadas = [],
  tarefas,
  vinculos = {},
  mes,
  ano,
  usuarioNome,
  mitInicial = '',
  onToggle,
  onOptimisticUnlock,
  podeEditar,
  podeEditarPorTipo,
  tarefaTipos = {},
  etapas = [],
  arquivos = [],
  prazosPorTipo = {},
  onAtualizarEtapa,
  onSalvarTexto,
  onUploadArquivo,
  onExcluirArquivo,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [optimisticDates, setOptimisticDates] = useState<Record<string, string | null>>({})
  const [localText, setLocalText] = useState<Record<string, string>>({})
  const [unlockingTipo, setUnlockingTipo] = useState<string | null>(null)
  const [motivoMap, setMotivoMap] = useState<Record<string, string>>({})
  const [unlockPending, setUnlockPending] = useState(false)
  const [mit, setMit] = useState(mitInicial)

  const [localEtapaText, setLocalEtapaText] = useState<Record<string, string>>({})
  const [localResposta, setLocalResposta] = useState<Record<string, string>>({})
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})

  const tipos = tarefasPersonalizadas
  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tipos.length

  function podeEditarTipo(tipo: string): boolean {
    return podeEditarPorTipo?.[tipo] ?? podeEditar
  }

  function getSavedIso(tipo: string): string {
    if (tipo in optimisticDates) return optimisticDates[tipo] ?? ''
    const t = mapaTarefa.get(tipo)
    if (!t?.concluida || !t.concluida_em) return ''
    return t.concluida_em.slice(0, 10)
  }

  function getDisplayValue(tipo: string): string {
    if (tipo in localText) return localText[tipo]
    return isoParaDisplay(getSavedIso(tipo))
  }

  const concluidas = tipos.filter(t => getSavedIso(t) !== '').length
  const competencia = `${String(mes).padStart(2, '0')}/${ano}`

  function handleTextChange(tipo: string, raw: string) {
    const formatted = autoFormatarData(raw)
    setLocalText(prev => ({ ...prev, [tipo]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setOptimisticDates(prev => ({ ...prev, [tipo]: iso }))
      setLocalText(prev => { const n = { ...prev }; delete n[tipo]; return n })
      startTransition(() => onToggle(tipo, true, iso))
    }
  }

  function handleTextBlur(tipo: string) {
    const val = localText[tipo]
    if (val === undefined) return

    if (val === '') {
      const tarefa = mapaTarefa.get(tipo)
      if (tarefa?.concluida) {
        setUnlockingTipo(tipo)
      } else {
        setOptimisticDates(prev => ({ ...prev, [tipo]: null }))
      }
    }
    setLocalText(prev => { const n = { ...prev }; delete n[tipo]; return n })
  }

  async function handleUnlock(tipo: string) {
    const motivo = motivoMap[tipo]?.trim()
    if (!motivo) return
    const tarefa = mapaTarefa.get(tipo)
    if (!tarefa) return
    setUnlockPending(true)
    try {
      await desbloquearTarefa(tarefa.id, motivo, usuarioNome, clienteNome, tipo, competencia)
      setOptimisticDates(prev => ({ ...prev, [tipo]: null }))
      onOptimisticUnlock?.(tipo)
      setUnlockingTipo(null)
      setMotivoMap(prev => { const n = { ...prev }; delete n[tipo]; return n })
    } finally {
      setUnlockPending(false)
    }
  }

  async function handleMITBlur() {
    await salvarMIT(clienteId, mit)
  }

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

  function getSavedEtapaIso(tipo: string, etapaNome: string): string {
    const e = etapasDaTarefa(tipo).find(e => e.nome === etapaNome)
    return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : ''
  }

  function getEtapaDisplayValue(tipo: string, etapaNome: string): string {
    const key = `${tipo}::${etapaNome}`
    if (key in localEtapaText) return localEtapaText[key]
    return isoParaDisplay(getSavedEtapaIso(tipo, etapaNome))
  }

  function handleEtapaTextChange(tipo: string, etapaNome: string, raw: string) {
    const key = `${tipo}::${etapaNome}`
    const formatted = autoFormatarData(raw)
    setLocalEtapaText(prev => ({ ...prev, [key]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setLocalEtapaText(prev => { const n = { ...prev }; delete n[key]; return n })
      startTransition(() => { onAtualizarEtapa?.(tipo, etapaNome, true, iso) })
    }
  }

  function handleEtapaTextBlur(tipo: string, etapaNome: string) {
    const key = `${tipo}::${etapaNome}`
    const val = localEtapaText[key]
    if (val === undefined) return
    if (val === '') {
      startTransition(() => { onAtualizarEtapa?.(tipo, etapaNome, false) })
    }
    setLocalEtapaText(prev => { const n = { ...prev }; delete n[key]; return n })
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
    startTransition(() => { onSalvarTexto?.(tipo, valor) })
    setLocalResposta(prev => { const n = { ...prev }; delete n[tipo]; return n })
  }

  async function handleUploadArquivo(tipo: string, files: FileList | null) {
    if (!files || files.length === 0 || !onUploadArquivo) return
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
    startTransition(() => { onExcluirArquivo?.(arquivoId) })
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
        {tipos.map(tipo => {
          const etapasDefinidas = tarefaTipos[tipo]?.etapas ?? null
          const tipoResposta: TipoResposta = tarefaTipos[tipo]?.tipoResposta ?? 'data'
          const savedIso = getSavedIso(tipo)
          const feito = savedIso !== ''
          const isUnlocking = unlockingTipo === tipo
          const displayVal = getDisplayValue(tipo)
          const diasPrazo = !feito ? (prazosPorTipo[normalizarTitulo(tipo)] ?? null) : null

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                feito
                  ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25'
                  : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/15'}`} />

                <span className={`text-sm flex-1 transition-colors ${feito ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>
                  {tipo}
                  {vinculos[tipo] && (
                    <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${formatarBadgeVinculo(vinculos[tipo]).classe}`}>
                      {formatarBadgeVinculo(vinculos[tipo]).texto}
                    </span>
                  )}
                  {diasPrazo !== null && (
                    <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-[var(--fg)]/5 ${alertaLabel(diasPrazo).cls}`}>
                      ⏱ {alertaLabel(diasPrazo).text}
                    </span>
                  )}
                </span>

                {tipoResposta === 'data' && !etapasDefinidas ? (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditarTipo(tipo) || isPending || isUnlocking}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={`text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
                      feito
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
                        : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
                    }`}
                  />
                ) : null}

                {feito && podeEditarTipo(tipo) && !etapasDefinidas && tipoResposta === 'data' && (
                  <button
                    onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
                    className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/60 px-2 py-1 rounded-lg border border-[var(--fg)]/8 hover:border-[var(--fg)]/20 transition-all whitespace-nowrap"
                  >
                    {isUnlocking ? 'Cancelar' : 'Desbloquear'}
                  </button>
                )}
              </div>

              {isUnlocking && (
                <div className="mt-1 ml-5 p-3 bg-[var(--fg)]/3 border border-[var(--fg)]/10 rounded-xl flex flex-col gap-2">
                  <p className="text-xs text-[var(--fg)]/50">Informe o motivo para desbloquear esta tarefa:</p>
                  <textarea
                    value={motivoMap[tipo] ?? ''}
                    onChange={e => setMotivoMap(prev => ({ ...prev, [tipo]: e.target.value }))}
                    placeholder="Motivo obrigatório..."
                    rows={2}
                    className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)] placeholder-[var(--fg)]/20 resize-none focus:outline-none focus:border-[var(--accent)]/50"
                  />
                  <button
                    onClick={() => handleUnlock(tipo)}
                    disabled={!(motivoMap[tipo]?.trim()) || unlockPending}
                    className="self-end text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded-lg hover:bg-[var(--accent)]/30 transition-all disabled:opacity-40"
                  >
                    {unlockPending ? 'Aguarde...' : 'Confirmar desbloqueio'}
                  </button>
                </div>
              )}

              {etapasDefinidas && (
                <div className="ml-5 mt-1 grid grid-cols-2 gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                  {etapasDefinidas.map(etapaNome => {
                    const etapaFeita = !!etapasDaTarefa(tipo).find(e => e.nome === etapaNome)?.concluida
                    const etapaDisplay = getEtapaDisplayValue(tipo, etapaNome)
                    return (
                      <div key={etapaNome} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--fg)]/60">{etapaNome}</span>
                        <input
                          type="text"
                          value={etapaDisplay}
                          onChange={e => handleEtapaTextChange(tipo, etapaNome, e.target.value)}
                          onBlur={() => handleEtapaTextBlur(tipo, etapaNome)}
                          disabled={!podeEditarTipo(tipo) || isPending}
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
                    disabled={!podeEditarTipo(tipo) || isPending}
                    placeholder="Digite a resposta..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50 disabled:opacity-40"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {podeEditarTipo(tipo) && (
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
                        <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          📎 {arq.name}
                        </a>
                        · {formatBytes(arq.size)}
                        {podeEditarTipo(tipo) && (
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

      {grupo === 'normal' && (
        <div className="mt-6 pt-5 border-t border-[var(--fg)]/8">
          <label className="block text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-2">
            MIT
          </label>
          <input
            type="text"
            value={mit}
            onChange={e => setMit(e.target.value)}
            onBlur={handleMITBlur}
            disabled={!podeEditar}
            placeholder="Anotação MIT..."
            className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-xl px-4 py-2.5 text-sm text-[var(--fg)] placeholder-[var(--fg)]/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-40"
          />
        </div>
      )}
    </div>
  )
}
