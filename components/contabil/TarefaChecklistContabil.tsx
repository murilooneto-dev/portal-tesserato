'use client'

import { useTransition, useState, type ReactNode } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Clock, Layers, Paperclip, X } from 'lucide-react'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta, TarefaGrupo } from '@/lib/types'
import type { VinculoStatus } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import { normalizarTitulo, alertaLabel } from '@/lib/calendario'
import { hojeISO } from '@/lib/mes-atual'
import { isoParaDisplay, displayParaIso, autoFormatarData } from '@/lib/data-checklist'
import { Badge, type BadgeTom } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Checkbox, Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/components/ui/cn'
import { ErroSalvamento, IndicadorSalvamento, useSalvamento } from '@/components/geral/TarefasSetorChecklist'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface TipoInfo {
  etapas: string[] | null
  tipoResposta: TipoResposta
}

interface Props {
  tarefasPersonalizadas: string[]
  grupos?: TarefaGrupo[]
  tarefaTipos: Record<string, TipoInfo>
  tarefas: Tarefa[]
  etapas: TarefaEtapa[]
  arquivos: Omit<TarefaArquivo, 'content_base64'>[]
  vinculos?: Record<string, VinculoStatus>
  prazosPorTipo?: Record<string, number>
  seletorMes?: ReactNode
  mes: number
  ano: number
  onToggleSimples: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onMarcarSemMovimento: (tipo: string, semMovimento: boolean) => Promise<void>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
  onSalvarTexto: (tipo: string, texto: string) => Promise<void>
  onUploadArquivo: (tipo: string, formData: FormData) => Promise<{ error: string | null }>
  onExcluirArquivo: (arquivoId: string) => Promise<void>
  podeEditar: boolean
}

// Tom do selo de prazo: mesmas faixas de alertaLabel (lib/calendario), em tokens do desenho novo.
function tomDoPrazo(dias: number): BadgeTom {
  if (dias <= 1) return 'dng'
  if (dias <= 5) return 'warn'
  if (dias <= 10) return 'info'
  return 'neu'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TarefaChecklistContabil({
  tarefasPersonalizadas,
  grupos = [],
  tarefaTipos,
  tarefas,
  etapas,
  arquivos,
  vinculos = {},
  prazosPorTipo = {},
  seletorMes,
  mes,
  ano,
  onToggleSimples,
  onMarcarSemMovimento,
  onAtualizarEtapa,
  onSalvarTexto,
  onUploadArquivo,
  onExcluirArquivo,
  podeEditar,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [localText, setLocalText] = useState<Record<string, string>>({})
  const [optimisticSemMovimento, setOptimisticSemMovimento] = useState<Record<string, boolean>>({})
  const [localResposta, setLocalResposta] = useState<Record<string, string>>({})
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set())
  // "Salvando… / Salvo / Erro" por tarefa (chave = tipo).
  const { estados: salvamento, iniciar, acompanhar } = useSalvamento()

  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tarefasPersonalizadas.length
  const concluidas = tarefasPersonalizadas.filter(t => mapaTarefa.get(t)?.concluida).length

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
      iniciar(tipo)
      startTransition(() => {
        if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, true, iso))
        else acompanhar(tipo, onToggleSimples(tipo, true, iso))
      })
    }
  }

  function handleTextBlur(tipo: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const val = localText[key]
    if (val === undefined) return
    if (val === '') {
      iniciar(tipo)
      startTransition(() => {
        if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, false))
        else acompanhar(tipo, onToggleSimples(tipo, false))
      })
    }
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function handleHoje(tipo: string, marcar: boolean, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
    iniciar(tipo)
    startTransition(() => {
      if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, marcar, marcar ? hojeISO() : undefined))
      else acompanhar(tipo, onToggleSimples(tipo, marcar, marcar ? hojeISO() : undefined))
    })
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
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, onSalvarTexto(tipo, valor)) })
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

  function handleExcluirArquivo(tipo: string, arquivoId: string) {
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, onExcluirArquivo(arquivoId)) })
  }

  function getSemMovimento(tipo: string): boolean {
    if (tipo in optimisticSemMovimento) return optimisticSemMovimento[tipo]
    return !!mapaTarefa.get(tipo)?.sem_movimento
  }

  function handleToggleSemMovimento(tipo: string) {
    const novo = !getSemMovimento(tipo)
    setOptimisticSemMovimento(prev => ({ ...prev, [tipo]: novo }))
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, onMarcarSemMovimento(tipo, novo)) })
  }

  function toggleGrupo(grupoId: string) {
    setGruposExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(grupoId)) next.delete(grupoId)
      else next.add(grupoId)
      return next
    })
  }

  // Caixa de marcar do jeito do desenho novo (18 px, cor de destaque).
  const caixa = 'h-[18px] w-[18px] flex-none cursor-pointer accent-[var(--acc)] disabled:cursor-not-allowed'

  // Uma tarefa = uma LINHA dentro do cartão: caixa, nome, data e "Sem movimento".
  // `recuo` = subtarefa de um grupo (fica recuada sob o cabeçalho do grupo).
  function renderLinhaTarefa(tipo: string, recuo = false) {
    const info = tarefaTipos[tipo]
    const etapasDefinidas = info?.etapas ?? null
    const tipoResposta: TipoResposta = info?.tipoResposta ?? 'data'
    const feito = !!mapaTarefa.get(tipo)?.concluida
    const semMovimentoAtivo = getSemMovimento(tipo)
    const mostrarCheckboxSemMovimento = podeEditar && !(feito && !semMovimentoAtivo)
    const temSemMovimento = mostrarCheckboxSemMovimento || semMovimentoAtivo
    const displayVal = getDisplayValue(tipo)
    const diasPrazo = !feito ? (prazosPorTipo[normalizarTitulo(tipo)] ?? null) : null
    const vinculo = vinculos[tipo]
    const badgeVinculo = vinculo ? formatarBadgeVinculo(vinculo) : null
    const campoData = tipoResposta === 'data' && !etapasDefinidas && !semMovimentoAtivo
    const recuoEsq = recuo ? 'pl-[42px]' : 'pl-[18px]'
    const recuoBloco = recuo ? 'ml-[72px] max-sm:ml-[42px]' : 'ml-[48px] max-sm:ml-[18px]'

    return (
      <div key={tipo} className="flex flex-col border-b border-line-soft last:border-b-0">
        <div className={cn('flex min-h-[54px] flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-[18px]', recuoEsq)}>
          {campoData ? (
            <input
              type="checkbox"
              checked={feito}
              onChange={e => handleHoje(tipo, e.target.checked)}
              disabled={!podeEditar || isPending}
              title="Preencher com a data de hoje"
              aria-label={`Concluir ${tipo} com a data de hoje`}
              className={caixa}
            />
          ) : (
            // Tarefas com etapas, texto ou sem movimento: a caixa só mostra o estado
            // (a conclusão vem das etapas/resposta ou do "Sem movimento").
            <input type="checkbox" checked={feito} readOnly disabled aria-label={`${tipo}: ${feito ? 'concluída' : 'pendente'}`} className={caixa} />
          )}

          <span className={cn('flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-2.5 gap-y-1 font-medium', feito ? 'text-fg-3 line-through' : 'text-fg')}>
            {tipo}
            {badgeVinculo && vinculo && (
              <Badge
                tom={vinculo.liberada ? 'ok' : 'warn'}
                icone={vinculo.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                className="no-underline"
              >
                {badgeVinculo.texto}
              </Badge>
            )}
            {diasPrazo !== null && (
              <Badge tom={tomDoPrazo(diasPrazo)} icone={<Clock size={14} aria-hidden="true" />} className="no-underline">
                {alertaLabel(diasPrazo).text}
              </Badge>
            )}
          </span>

          {(campoData || temSemMovimento) && <div className="flex w-full items-center gap-3 pl-[30px] sm:w-auto sm:pl-0">
            {campoData && (
              <Input
                type="text"
                value={displayVal}
                onChange={e => handleTextChange(tipo, e.target.value)}
                onBlur={() => handleTextBlur(tipo)}
                disabled={!podeEditar || isPending}
                placeholder="dd/mm/aaaa"
                aria-label={`Data de conclusão de ${tipo}`}
                maxLength={10}
                className={cn('text-center tabular-nums max-sm:h-11 max-sm:flex-1 sm:w-[150px]', feito && 'border-ok-soft text-ok')}
              />
            )}

            {/* "Sem movimento" aparece uma vez só: a caixa para quem edita, o selo para quem só lê. */}
            <div className={cn('flex-none sm:w-[140px]', !temSemMovimento && 'max-sm:hidden')}>
              {mostrarCheckboxSemMovimento ? (
                <Checkbox
                  rotulo={<><span className="sm:hidden">Sem mov.</span><span className="max-sm:hidden">Sem movimento</span></>}
                  checked={semMovimentoAtivo}
                  onChange={() => handleToggleSemMovimento(tipo)}
                  disabled={isPending}
                  className="min-h-11 whitespace-nowrap text-[13px] sm:min-h-0"
                />
              ) : semMovimentoAtivo ? (
                <Badge>Sem movimento</Badge>
              ) : null}
            </div>
            <IndicadorSalvamento estado={salvamento[tipo]} className="ml-auto" />
          </div>}
          {!(campoData || temSemMovimento) && <IndicadorSalvamento estado={salvamento[tipo]} className="ml-auto" />}
        </div>

        <ErroSalvamento estado={salvamento[tipo]} className={cn('-mt-1', recuoBloco)} />

        {etapasDefinidas && tipoResposta !== 'checklist' && !semMovimentoAtivo && (
          <div className={cn('mb-3 mr-[18px] -mt-0.5 grid grid-cols-1 gap-x-[22px] gap-y-2.5 rounded-[10px] border border-line-soft p-3 sm:grid-cols-2', recuoBloco)}>
            {etapasDefinidas.map(etapaNome => {
              const etapaFeita = !!etapasDaTarefa(tipo).find(e => e.nome === etapaNome)?.concluida
              const etapaDisplay = getDisplayValue(tipo, etapaNome)
              return (
                <div key={etapaNome} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={etapaFeita}
                    onChange={e => handleHoje(tipo, e.target.checked, etapaNome)}
                    disabled={!podeEditar || isPending}
                    title="Preencher com a data de hoje"
                    aria-label={`Concluir ${etapaNome} de ${tipo} com a data de hoje`}
                    className={caixa}
                  />
                  <span className="min-w-0 flex-1 text-[13px] text-fg-2">{etapaNome}</span>
                  <Input
                    type="text"
                    value={etapaDisplay}
                    onChange={e => handleTextChange(tipo, e.target.value, etapaNome)}
                    onBlur={() => handleTextBlur(tipo, etapaNome)}
                    disabled={!podeEditar || isPending}
                    placeholder="dd/mm/aaaa"
                    aria-label={`${etapaNome} de ${tipo}`}
                    maxLength={10}
                    className={cn('w-[128px] text-center tabular-nums max-sm:h-11', etapaFeita && 'border-ok-soft text-ok')}
                  />
                </div>
              )
            })}
          </div>
        )}

        {etapasDefinidas && tipoResposta === 'checklist' && !semMovimentoAtivo && (
          <div className={cn('mb-3 mr-[18px] -mt-0.5 grid grid-cols-1 gap-x-[22px] gap-y-2.5 rounded-[10px] border border-line-soft p-3 sm:grid-cols-2', recuoBloco)}>
            {etapasDefinidas.map(opcaoNome => {
              const opcaoFeita = !!etapasDaTarefa(tipo).find(e => e.nome === opcaoNome)?.concluida
              return (
                <Checkbox
                  key={opcaoNome}
                  rotulo={<span className={opcaoFeita ? 'text-fg-3 line-through' : undefined}>{opcaoNome}</span>}
                  checked={opcaoFeita}
                  onChange={e => { iniciar(tipo); startTransition(() => acompanhar(tipo, onAtualizarEtapa(tipo, opcaoNome, e.target.checked))) }}
                  disabled={!podeEditar || isPending}
                  className="min-h-11 text-[13px] sm:min-h-0"
                />
              )
            })}
          </div>
        )}

        {tipoResposta === 'texto' && !etapasDefinidas && !semMovimentoAtivo && (
          <div className={cn('mb-3 mr-[18px] flex flex-col gap-2.5', recuoBloco)}>
            <Textarea
              value={getRespostaTexto(tipo)}
              onChange={e => handleRespostaTextoChange(tipo, e.target.value)}
              onBlur={() => handleRespostaTextoBlur(tipo)}
              disabled={!podeEditar || isPending}
              placeholder="Digite a resposta..."
              aria-label={`Resposta de ${tipo}`}
              rows={2}
              className="min-h-[56px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              {podeEditar && (
                <label className={cn(
                  'inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc max-sm:h-11',
                  uploadingTipo === tipo && 'pointer-events-none opacity-50',
                )}>
                  <Paperclip size={14} aria-hidden="true" />
                  {uploadingTipo === tipo ? 'Enviando...' : 'Anexar arquivo'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                    multiple
                    className="sr-only"
                    onChange={e => handleUploadArquivo(tipo, e.target.files)}
                    disabled={isPending}
                  />
                </label>
              )}
              {arquivosDaTarefa(tipo).map(arq => (
                <span key={arq.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-raised py-1 pl-2.5 pr-1 text-[13px] text-fg-2">
                  <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
                    <Paperclip size={14} aria-hidden="true" className="flex-none" />
                    <span className="truncate">{arq.name}</span>
                  </a>
                  <span className="flex-none text-fg-3">{formatBytes(arq.size)}</span>
                  {podeEditar && (
                    <IconButton
                      rotulo={`Excluir ${arq.name}`}
                      icone={<X size={14} aria-hidden="true" />}
                      onClick={() => handleExcluirArquivo(tipo, arq.id)}
                      className="h-7 w-7 max-sm:h-11 max-sm:w-11"
                    />
                  )}
                </span>
              ))}
              {erroUpload[tipo] && (
                <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle size={14} aria-hidden="true" />
                  {erroUpload[tipo]}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderLista() {
    const grupoPorTarefa = new Map<string, TarefaGrupo>()
    for (const g of grupos) {
      for (const t of g.tarefas) {
        if (!grupoPorTarefa.has(t)) grupoPorTarefa.set(t, g)
      }
    }
    const gruposRenderizados = new Set<string>()

    return tarefasPersonalizadas.map(tipo => {
      const grupoDaTarefa = grupoPorTarefa.get(tipo)
      if (!grupoDaTarefa) return renderLinhaTarefa(tipo)
      if (gruposRenderizados.has(grupoDaTarefa.id)) return null
      gruposRenderizados.add(grupoDaTarefa.id)

      const tarefasDoGrupo = grupoDaTarefa.tarefas.filter(t => tarefasPersonalizadas.includes(t))
      const concluidasDoGrupo = tarefasDoGrupo.filter(t => !!mapaTarefa.get(t)?.concluida).length
      const expandido = gruposExpandidos.has(grupoDaTarefa.id)
      const Seta = expandido ? ChevronDown : ChevronRight

      return (
        <div key={`grupo-${grupoDaTarefa.id}`} className="flex flex-col border-b border-line-soft last:border-b-0">
          <button
            type="button"
            onClick={() => toggleGrupo(grupoDaTarefa.id)}
            aria-expanded={expandido}
            className="flex min-h-12 items-center gap-3 bg-fg/[0.025] px-[18px] text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
          >
            <Seta size={18} aria-hidden="true" className="flex-none text-acc-text" />
            <Layers size={16} aria-hidden="true" className="flex-none text-fg-3" />
            <span className="min-w-0 flex-1 font-semibold text-fg">{grupoDaTarefa.nome}</span>
            <Badge tom={tarefasDoGrupo.length > 0 && concluidasDoGrupo === tarefasDoGrupo.length ? 'ok' : 'neu'}>
              {concluidasDoGrupo} de {tarefasDoGrupo.length}
            </Badge>
          </button>
          {expandido && (
            <div className="flex flex-col border-t border-line-soft">
              {tarefasDoGrupo.map(t => renderLinhaTarefa(t, true))}
            </div>
          )}
        </div>
      )
    })
  }

  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0

  return (
    <section className="min-w-0 rounded-xl border border-line-soft bg-surface">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 border-b border-line-soft px-[18px] py-3.5">
        {seletorMes ? (
          <>
            <h2 className="text-[15px] font-semibold text-fg max-sm:sr-only">Tarefas de</h2>
            {seletorMes}
          </>
        ) : (
          <h2 className="text-[15px] font-semibold text-fg">Tarefas — {MESES[mes - 1]}/{ano}</h2>
        )}
        <Badge tom={total > 0 && concluidas === total ? 'ok' : 'acc'}>{concluidas} de {total}</Badge>
        <div
          role="progressbar"
          aria-label="Tarefas concluídas no mês"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={concluidas}
          className="ml-auto h-1.5 w-full overflow-hidden rounded bg-raised sm:w-[180px]"
        >
          <div className="h-full rounded bg-acc transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-col">
        {total === 0 ? (
          <p className="px-[18px] py-6 text-center text-[13px] text-fg-3">Nenhuma tarefa para este cliente neste mês.</p>
        ) : renderLista()}
      </div>
    </section>
  )
}
