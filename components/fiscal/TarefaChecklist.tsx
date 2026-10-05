'use client'

import { useTransition, useState } from 'react'
import type { Tarefa, TarefaEtapa, TarefaArquivo, TipoResposta, TarefaGrupo } from '@/lib/types'
import type { VinculoStatus } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import { desbloquearTarefa, salvarMIT, marcarSemMovimento } from '@/app/fiscal/clientes/actions'
import { normalizarTitulo, alertaLabel } from '@/lib/calendario'
import { isoParaDisplay, displayParaIso, autoFormatarData } from '@/lib/data-checklist'
import { AlertCircle, Check, ChevronRight, Clock, Layers, Lock, Paperclip, Unlock, X } from 'lucide-react'
import { Badge, type BadgeTom } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox, Input, Textarea } from '@/components/ui/Input'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ErroSalvamento, IndicadorSalvamento, useSalvamento } from '@/components/geral/TarefasSetorChecklist'

const CHAVE_MIT = '__mit__'
const MESES_EXTENSO = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

interface TipoInfo {
  etapas: string[] | null
  tipoResposta: TipoResposta
}

interface Props {
  clienteId: string
  grupo: string
  tarefasPersonalizadas?: string[]
  tarefas: Tarefa[]
  grupos?: TarefaGrupo[]
  vinculos?: Record<string, VinculoStatus>
  mes: number
  ano: number
  usuarioId: string
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

export default function TarefaChecklist({
  clienteId,
  grupo,
  tarefasPersonalizadas = [],
  tarefas,
  grupos = [],
  vinculos = {},
  mes,
  ano,
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
  const [optimisticSemMovimento, setOptimisticSemMovimento] = useState<Record<string, boolean>>({})
  const [localText, setLocalText] = useState<Record<string, string>>({})
  const [unlockingTipo, setUnlockingTipo] = useState<string | null>(null)
  const [motivoMap, setMotivoMap] = useState<Record<string, string>>({})
  const [unlockPending, setUnlockPending] = useState(false)
  const [mit, setMit] = useState(mitInicial)
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set())

  const [localEtapaText, setLocalEtapaText] = useState<Record<string, string>>({})
  const [localResposta, setLocalResposta] = useState<Record<string, string>>({})
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})
  // "Salvando… / Salvo / Erro" por tarefa (chave = tipo) e do MIT (CHAVE_MIT).
  const { estados: salvamento, iniciar, acompanhar } = useSalvamento()

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

  function getSemMovimento(tipo: string): boolean {
    if (tipo in optimisticSemMovimento) return optimisticSemMovimento[tipo]
    return !!mapaTarefa.get(tipo)?.sem_movimento
  }

  function handleToggleSemMovimento(tipo: string) {
    const novo = !getSemMovimento(tipo)
    setOptimisticSemMovimento(prev => ({ ...prev, [tipo]: novo }))
    setOptimisticDates(prev => ({ ...prev, [tipo]: novo ? new Date().toISOString().slice(0, 10) : null }))
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, marcarSemMovimento(clienteId, tipo, mes, ano, novo)) })
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
      iniciar(tipo)
      startTransition(() => acompanhar(tipo, onToggle(tipo, true, iso)))
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
      await desbloquearTarefa(tarefa.id, motivo, tipo, competencia)
      setOptimisticDates(prev => ({ ...prev, [tipo]: null }))
      onOptimisticUnlock?.(tipo)
      setUnlockingTipo(null)
      setMotivoMap(prev => { const n = { ...prev }; delete n[tipo]; return n })
    } finally {
      setUnlockPending(false)
    }
  }

  async function handleMITBlur() {
    iniciar(CHAVE_MIT)
    await acompanhar(CHAVE_MIT, salvarMIT(clienteId, mit))
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
      iniciar(tipo)
      startTransition(() => { acompanhar(tipo, onAtualizarEtapa?.(tipo, etapaNome, true, iso)) })
    }
  }

  function handleEtapaTextBlur(tipo: string, etapaNome: string) {
    const key = `${tipo}::${etapaNome}`
    const val = localEtapaText[key]
    if (val === undefined) return
    if (val === '') {
      iniciar(tipo)
      startTransition(() => { acompanhar(tipo, onAtualizarEtapa?.(tipo, etapaNome, false)) })
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
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, onSalvarTexto?.(tipo, valor)) })
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

  function handleExcluirArquivo(tipo: string, arquivoId: string) {
    iniciar(tipo)
    startTransition(() => { acompanhar(tipo, onExcluirArquivo?.(arquivoId)) })
  }


  function toggleGrupo(grupoId: string) {
    setGruposExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(grupoId)) next.delete(grupoId)
      else next.add(grupoId)
      return next
    })
  }

  function renderLinhaTarefa(tipo: string) {
    const etapasDefinidas = tarefaTipos[tipo]?.etapas ?? null
    const tipoResposta: TipoResposta = tarefaTipos[tipo]?.tipoResposta ?? 'data'
    const savedIso = getSavedIso(tipo)
    const feito = savedIso !== ''
    const semMovimentoAtivo = getSemMovimento(tipo)
    const mostrarCheckboxSemMovimento = podeEditarTipo(tipo) && !(feito && !semMovimentoAtivo)
    const isUnlocking = unlockingTipo === tipo
    const displayVal = getDisplayValue(tipo)
    const diasPrazo = !feito ? (prazosPorTipo[normalizarTitulo(tipo)] ?? null) : null
    const vinculo = vinculos[tipo]
    const badgeVinculo = vinculo ? formatarBadgeVinculo(vinculo) : null
    const semPermissao = !podeEditarTipo(tipo)
    const campoData = tipoResposta === 'data' && !etapasDefinidas && !semMovimentoAtivo

    return (
      <div key={tipo} className="flex flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-[18px] py-3 last:border-b-0">
          <span
            aria-hidden="true"
            className={`h-2 w-2 flex-none rounded-full ${semMovimentoAtivo ? 'bg-fg-3' : feito ? 'bg-ok' : 'bg-warn'}`}
          />

          <span className={`flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-2.5 gap-y-1 font-medium ${feito ? 'text-fg-3 line-through' : 'text-fg'}`}>
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

          {semMovimentoAtivo && <Badge tom="neu">Sem movimento</Badge>}

          {campoData && (
            <span className="inline-flex items-center gap-2">
              {feito && <Lock size={15} role="img" aria-label="Data travada: desbloqueie para alterar" className="text-ok" />}
              {semPermissao && !feito && <Lock size={15} role="img" aria-label="Você não pode editar esta tarefa" className="text-fg-3" />}
              <Input
                type="text"
                value={displayVal}
                onChange={e => handleTextChange(tipo, e.target.value)}
                onBlur={() => handleTextBlur(tipo)}
                disabled={semPermissao || isPending || isUnlocking}
                placeholder="dd/mm/aaaa"
                aria-label={`Data de conclusão de ${tipo}`}
                maxLength={10}
                className={`w-[150px] text-center tabular-nums ${feito ? 'border-ok-soft text-ok' : ''}`}
              />
            </span>
          )}

          {mostrarCheckboxSemMovimento && (
            <Checkbox
              rotulo="Sem movimento"
              checked={semMovimentoAtivo}
              onChange={() => handleToggleSemMovimento(tipo)}
              disabled={isPending}
              className="min-h-[44px] whitespace-nowrap sm:min-h-0"
            />
          )}

          {feito && podeEditarTipo(tipo) && !etapasDefinidas && tipoResposta === 'data' && !semMovimentoAtivo && (
            <Button
              tamanho="p"
              icone={<Unlock size={14} aria-hidden="true" />}
              onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
              className="max-sm:h-11"
            >
              Desbloquear
            </Button>
          )}

          <IndicadorSalvamento estado={salvamento[tipo]} className="ml-auto" />
        </div>

        <ErroSalvamento estado={salvamento[tipo]} className="mt-2.5 px-[18px] pl-[38px]" />

        {etapasDefinidas && !semMovimentoAtivo && (
          <div className="mb-3 ml-[38px] mr-[18px] grid grid-cols-1 gap-x-[18px] gap-y-2.5 rounded-[10px] border border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-3">
            {etapasDefinidas.map(etapaNome => {
              const etapaDisplay = getEtapaDisplayValue(tipo, etapaNome)
              const etapaFeita = getSavedEtapaIso(tipo, etapaNome) !== ''

              return (
                <div key={etapaNome} className="flex items-center justify-between gap-2.5">
                  <span className="flex-1 text-[13px] text-fg-2">{etapaNome}</span>
                  <Input
                    type="text"
                    value={etapaDisplay}
                    onChange={e => handleEtapaTextChange(tipo, etapaNome, e.target.value)}
                    onBlur={() => handleEtapaTextBlur(tipo, etapaNome)}
                    disabled={semPermissao || isPending}
                    placeholder="dd/mm/aaaa"
                    aria-label={`${etapaNome} de ${tipo}`}
                    maxLength={10}
                    className={`w-[128px] text-center tabular-nums ${etapaFeita ? 'border-ok-soft text-ok' : ''}`}
                  />
                </div>
              )
            })}
          </div>
        )}

        {tipoResposta === 'texto' && !etapasDefinidas && !semMovimentoAtivo && (
          <div className="mb-3 ml-[38px] mr-[18px] flex flex-col gap-2.5">
            <Textarea
              value={getRespostaTexto(tipo)}
              onChange={e => handleRespostaTextoChange(tipo, e.target.value)}
              onBlur={() => handleRespostaTextoBlur(tipo)}
              disabled={semPermissao || isPending}
              placeholder="Digite a resposta..."
              aria-label={`Resposta de ${tipo}`}
              rows={2}
              className="min-h-[56px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              {podeEditarTipo(tipo) && (
                <label className={`inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc max-sm:h-11 ${
                  uploadingTipo === tipo ? 'pointer-events-none opacity-50' : ''
                }`}>
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
                <span key={arq.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised py-1 pl-2.5 pr-1 text-[13px] text-fg-2">
                  <a href={`/api/arquivos/tarefa/${arq.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                    <Paperclip size={14} aria-hidden="true" />
                    {arq.name}
                  </a>
                  <span className="text-fg-3">{formatBytes(arq.size)}</span>
                  {podeEditarTipo(tipo) && (
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

    return tipos.map(tipo => {
      const grupoDaTarefa = grupoPorTarefa.get(tipo)
      if (!grupoDaTarefa) return renderLinhaTarefa(tipo)
      if (gruposRenderizados.has(grupoDaTarefa.id)) return null
      gruposRenderizados.add(grupoDaTarefa.id)

      const tarefasDoGrupo = grupoDaTarefa.tarefas.filter(t => tipos.includes(t))
      const concluidasDoGrupo = tarefasDoGrupo.filter(t => getSavedIso(t) !== '').length
      const expandido = gruposExpandidos.has(grupoDaTarefa.id)

      return (
        <div key={`grupo-${grupoDaTarefa.id}`} className="flex flex-col border-b border-line-soft last:border-b-0">
          <button
            type="button"
            onClick={() => toggleGrupo(grupoDaTarefa.id)}
            aria-expanded={expandido}
            className="flex min-h-[50px] items-center gap-3 px-[18px] text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <ChevronRight size={18} aria-hidden="true" className={`flex-none text-fg-3 transition-transform ${expandido ? 'rotate-90' : ''}`} />
            <Layers size={16} aria-hidden="true" className="flex-none text-fg-3" />
            <span className="flex-1 font-semibold text-fg">{grupoDaTarefa.nome}</span>
            <Badge>{concluidasDoGrupo} de {tarefasDoGrupo.length}</Badge>
          </button>
          {expandido && (
            <div className="ml-5 flex flex-col border-l border-line-soft">
              {tarefasDoGrupo.map(t => renderLinhaTarefa(t))}
            </div>
          )}
        </div>
      )
    })
  }

  const tarefaDesbloqueando = unlockingTipo
  const motivoAtual = tarefaDesbloqueando ? (motivoMap[tarefaDesbloqueando] ?? '') : ''

  return (
    <Card
      titulo={`Tarefas de ${MESES_EXTENSO[mes - 1]}`}
      meta={<Badge tom={total > 0 && concluidas === total ? 'ok' : 'neu'}>{concluidas} de {total}</Badge>}
      semPadding
    >
      <div
        role="progressbar"
        aria-label="Tarefas concluídas no mês"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={concluidas}
        className="h-1.5 w-full bg-raised"
      >
        <div
          className="h-full bg-acc transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col">
        {renderLista()}
      </div>

      {grupo === 'normal' && (
        <div className="border-t border-line-soft px-[18px] py-4">
          <Field rotulo="MIT">
            {({ id }) => (
              <div className="flex items-center gap-3">
                <Input
                  id={id}
                  type="text"
                  value={mit}
                  onChange={e => setMit(e.target.value)}
                  onBlur={handleMITBlur}
                  disabled={!podeEditar}
                  placeholder="Anotação MIT..."
                  className="min-w-0 flex-1"
                />
                <IndicadorSalvamento estado={salvamento[CHAVE_MIT]} />
              </div>
            )}
          </Field>
          <ErroSalvamento estado={salvamento[CHAVE_MIT]} className="mb-0 mt-2" />
        </div>
      )}

      <Modal
        aberto={tarefaDesbloqueando !== null}
        onFechar={() => setUnlockingTipo(null)}
        titulo="Desbloquear tarefa"
        subtitulo={tarefaDesbloqueando ?? undefined}
        largura="p"
        bloqueado={unlockPending}
        rodape={
          <div className="ml-auto flex gap-2.5">
            <Button variante="fantasma" onClick={() => setUnlockingTipo(null)} disabled={unlockPending}>Cancelar</Button>
            <Button
              variante="primario"
              onClick={() => { if (tarefaDesbloqueando) handleUnlock(tarefaDesbloqueando) }}
              disabled={!motivoAtual.trim()}
              carregando={unlockPending}
            >
              {unlockPending ? 'Aguarde...' : 'Confirmar desbloqueio'}
            </Button>
          </div>
        }
      >
        <Field rotulo="Informe o motivo para desbloquear esta tarefa" ajuda="O motivo é obrigatório e fica no log.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              data-autofocus=""
              value={motivoAtual}
              onChange={e => { if (tarefaDesbloqueando) setMotivoMap(prev => ({ ...prev, [tarefaDesbloqueando]: e.target.value })) }}
              placeholder="Motivo obrigatório..."
              rows={3}
            />
          )}
        </Field>
      </Modal>
    </Card>
  )
}
