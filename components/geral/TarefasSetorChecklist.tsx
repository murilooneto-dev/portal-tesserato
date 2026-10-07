'use client'

import { useCallback, useState, useTransition } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Layers, ListChecks } from 'lucide-react'
import type { GrupoSetor, Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
import { organizarEmGrupos } from '@/lib/tarefa-grupos-setor'
import { formatarDdMm, parseDdMmParaIso } from '@/lib/formatar-data'
import { MESES } from '@/lib/mes-navegacao'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/components/ui/cn'

// Checklist de tarefas da ficha do cliente no Societário e no Financeiro (s-03 / fn-05).
// Mesmo formato de TarefaSocietarioAplicavel e TarefaFinanceiroAplicavel.
export interface TarefaSetorAplicavel {
  tarefaTipoId: string
  nome: string
  tipoResposta: TipoResposta
  etapas: string[] | null
  responsavelId: string | null
  tarefa: Tarefa | null
}

type Resultado = { error: string | null } | void
export type EstadoSalvar = { tipo: 'salvando' } | { tipo: 'salvo' } | { tipo: 'erro'; mensagem: string }

interface Props {
  tarefas: TarefaSetorAplicavel[]
  etapas: TarefaEtapa[]
  podeEditar: boolean
  mes: number
  /** "Salvo automaticamente" à direita do título (Societário). */
  avisoSalvoAutomatico?: boolean
  className?: string
  /** Grupos do setor (Financeiro): as tarefas de cada grupo viram uma linha que abre e fecha. Sem isso, a lista é a de sempre. */
  grupos?: GrupoSetor[]
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<Resultado>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<Resultado>
  onSalvarTexto: (tipo: string, texto: string) => Promise<Resultado>
}

export default function TarefasSetorChecklist({
  tarefas, etapas, podeEditar, mes, avisoSalvoAutomatico = false, className, grupos, onToggle, onAtualizarEtapa, onSalvarTexto,
}: Props) {
  const [, startTransition] = useTransition()
  const [textoDraft, setTextoDraft] = useState<Record<string, string>>({})
  const [dataDraft, setDataDraft] = useState<Record<string, string>>({})
  const [etapaDraft, setEtapaDraft] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<Record<string, EstadoSalvar>>({})
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set())

  function toggleGrupo(grupoId: string) {
    setGruposExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(grupoId)) next.delete(grupoId)
      else next.add(grupoId)
      return next
    })
  }

  function etapasDaTarefa(tarefaId: string | undefined) {
    if (!tarefaId) return []
    return etapas.filter(e => e.tarefa_id === tarefaId)
  }

  // Dispara a action e mostra "Salvo" ou o erro na linha da tarefa.
  function salvar(tipo: string, acao: () => Promise<Resultado>) {
    setEstado(prev => ({ ...prev, [tipo]: { tipo: 'salvando' } }))
    startTransition(async () => {
      try {
        const res = await acao()
        const erro = res && res.error ? res.error : null
        setEstado(prev => ({ ...prev, [tipo]: erro ? { tipo: 'erro', mensagem: erro } : { tipo: 'salvo' } }))
      } catch {
        setEstado(prev => ({ ...prev, [tipo]: { tipo: 'erro', mensagem: 'Não foi possível salvar. Tente de novo.' } }))
      }
    })
  }

  function renderLinhaTarefa(t: TarefaSetorAplicavel) {
    const feito = t.tarefa?.concluida ?? false
    const campoData = t.tipoResposta === 'data' && !t.etapas
    const dataOriginal = formatarDdMm(t.tarefa?.concluida_em ?? null)
    const chaveData = dataDraft[t.nome] ?? dataOriginal
    const textoOriginal = t.tarefa?.resposta_texto ?? ''
    const chaveTexto = textoDraft[t.nome] ?? textoOriginal
    const est = estado[t.nome]

    return (
      <div key={t.tarefaTipoId} className="flex flex-col border-b border-line-soft last:border-b-0">
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-[18px] py-2.5">
          <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', feito ? 'bg-ok' : 'bg-warn')} />
          <span className="min-w-0 flex-1 basis-40 font-medium text-fg">
            {t.nome}
            <span className="sr-only">{feito ? ' (concluída)' : ' (pendente)'}</span>
          </span>

          <div className={cn('flex w-full items-center gap-3 pl-5 sm:w-auto sm:pl-0', !campoData && !est && 'max-sm:hidden')}>
            {campoData && (
              <Input
                type="text"
                value={chaveData}
                onChange={e => {
                  const valor = e.target.value
                  setDataDraft(prev => ({ ...prev, [t.nome]: valor }))
                }}
                onBlur={() => {
                  // Só salva se a data mudou em relação ao que está gravado:
                  // sair do campo sem editar não grava nada.
                  if (chaveData === dataOriginal) return
                  const iso = parseDdMmParaIso(chaveData)
                  salvar(t.nome, () => onToggle(t.nome, chaveData.trim() !== '', iso))
                }}
                disabled={!podeEditar}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                aria-label={`Data de conclusão de ${t.nome}`}
                className={cn('text-center tabular-nums max-sm:h-11 max-sm:flex-1 sm:w-[156px]', feito && 'border-ok-soft text-ok')}
              />
            )}
            <span className="ml-auto w-[70px] flex-none text-right text-[13px]" aria-live="polite">
              {est?.tipo === 'salvando' && <span className="text-fg-3">Salvando…</span>}
              {est?.tipo === 'salvo' && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-ok">
                  <Check size={14} strokeWidth={2.4} aria-hidden="true" />Salvo
                </span>
              )}
              {est?.tipo === 'erro' && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-danger" title={est.mensagem}>
                  <AlertCircle size={14} aria-hidden="true" />Erro
                </span>
              )}
            </span>
          </div>
        </div>

        {est?.tipo === 'erro' && (
          <p role="alert" className="-mt-1 mb-2.5 px-[18px] pl-[38px] text-[13px] text-danger">{est.mensagem}</p>
        )}

        {t.etapas && t.etapas.length > 0 && (
          <div className="mb-3 ml-[38px] mr-[18px] -mt-0.5 grid grid-cols-1 gap-x-[22px] gap-y-2.5 rounded-[10px] border border-line-soft p-3 max-sm:ml-[18px] sm:grid-cols-2">
            {t.etapas.map(etapaNome => {
              const etapaAtual = etapasDaTarefa(t.tarefa?.id).find(e => e.nome === etapaNome)
              const etapaFeita = !!etapaAtual?.concluida
              const chave = `${t.nome}::${etapaNome}`
              const original = formatarDdMm(etapaAtual?.concluida_em ?? null)
              const valor = etapaDraft[chave] ?? original
              return (
                <div key={etapaNome} className="flex items-center gap-2.5">
                  <span className="min-w-0 flex-1 text-[13px] text-fg-2">{etapaNome}</span>
                  <Input
                    type="text"
                    value={valor}
                    onChange={e => {
                      const v = e.target.value
                      setEtapaDraft(prev => ({ ...prev, [chave]: v }))
                    }}
                    onBlur={() => {
                      // Mesma proteção do campo de data: só salva se mudou.
                      if (valor === original) return
                      const iso = parseDdMmParaIso(valor)
                      salvar(t.nome, () => onAtualizarEtapa(t.nome, etapaNome, valor.trim() !== '', iso))
                    }}
                    disabled={!podeEditar}
                    placeholder="dd/mm/aaaa"
                    maxLength={10}
                    aria-label={`${etapaNome} de ${t.nome}`}
                    className={cn('w-[128px] flex-none text-center tabular-nums max-sm:h-11', etapaFeita && 'border-ok-soft text-ok')}
                  />
                </div>
              )
            })}
          </div>
        )}

        {t.tipoResposta === 'texto' && (
          <div className="mb-3.5 ml-[38px] mr-[18px] max-sm:ml-[18px]">
            <Textarea
              value={chaveTexto}
              onChange={e => {
                const v = e.target.value
                setTextoDraft(prev => ({ ...prev, [t.nome]: v }))
              }}
              onBlur={() => {
                // Só salva se o texto mudou (a action grava o texto sem espaços nas pontas).
                if (chaveTexto.trim() === textoOriginal.trim()) return
                salvar(t.nome, () => onSalvarTexto(t.nome, chaveTexto))
              }}
              disabled={!podeEditar}
              placeholder="Digite a resposta…"
              aria-label={`Resposta de ${t.nome}`}
              rows={2}
              className="min-h-16"
            />
          </div>
        )}
      </div>
    )
  }

  const total = tarefas.length
  const concluidas = tarefas.filter(t => t.tarefa?.concluida).length
  const completo = total > 0 && concluidas === total

  return (
    <Card
      semPadding
      className={className}
      titulo={`Tarefas de ${MESES[mes - 1].toLowerCase()}`}
      meta={total > 0 ? <Badge tom={completo ? 'ok' : 'acc'}>{concluidas} de {total}</Badge> : undefined}
      acoes={avisoSalvoAutomatico ? <span className="text-[13px] text-fg-3">Salvo automaticamente</span> : undefined}
    >
      {total === 0 ? (
        <EmptyState
          icone={<ListChecks size={24} />}
          titulo="Nenhuma tarefa cadastrada"
          descricao="Nenhuma tarefa cadastrada para este cliente no período atual."
        />
      ) : (
        <div className="flex flex-col">
          {organizarEmGrupos(tarefas, grupos ?? []).map(item => {
            if (item.tipo === 'tarefa') return renderLinhaTarefa(item.tarefa)

            const { grupo, tarefas: doGrupo } = item
            const feitas = doGrupo.filter(t => t.tarefa?.concluida).length
            const expandido = gruposExpandidos.has(grupo.id)
            const Seta = expandido ? ChevronDown : ChevronRight

            return (
              <div key={`grupo-${grupo.id}`} className="flex flex-col border-b border-line-soft last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.id)}
                  aria-expanded={expandido}
                  className="flex min-h-12 items-center gap-3 bg-fg/[0.025] px-[18px] text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
                >
                  <Seta size={18} aria-hidden="true" className="flex-none text-acc-text" />
                  <Layers size={16} aria-hidden="true" className="flex-none text-fg-3" />
                  <span className="min-w-0 flex-1 font-semibold text-fg">{grupo.nome}</span>
                  <Badge tom={doGrupo.length > 0 && feitas === doGrupo.length ? 'ok' : 'neu'}>
                    {feitas} de {doGrupo.length}
                  </Badge>
                </button>
                {expandido && (
                  <div className="flex flex-col border-t border-line-soft">
                    {doGrupo.map(t => renderLinhaTarefa(t))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Salvamento automático (ds-06) reaproveitado pelos checklists do Fiscal, do
// Contábil e do Pessoal: "Salvando…", "Salvo" ou o erro ao lado do campo.
// Só OBSERVA a promessa da chamada que a tela já fazia: não muda o que é salvo,
// nem quando, nem se a transição espera por ela.
// ---------------------------------------------------------------------------

const ERRO_SALVAR = 'Não foi possível salvar. Tente de novo.'

export function useSalvamento() {
  const [estados, setEstados] = useState<Record<string, EstadoSalvar>>({})

  // Chamado ANTES do startTransition, para o "Salvando…" aparecer na hora
  // (atualização feita dentro de uma transição só aparece quando ela termina).
  const iniciar = useCallback((chave: string) => {
    setEstados(prev => ({ ...prev, [chave]: { tipo: 'salvando' } }))
  }, [])

  // Recebe a MESMA promessa da chamada e a devolve intocada: quem a passava
  // de volta ao startTransition continua passando.
  const acompanhar = useCallback(<T,>(chave: string, promessa: Promise<T> | undefined): Promise<T> | undefined => {
    if (!promessa) {
      setEstados(prev => { const n = { ...prev }; delete n[chave]; return n })
      return promessa
    }
    promessa.then(
      res => {
        const erro = res && typeof res === 'object' && 'error' in res ? (res as { error?: unknown }).error : null
        setEstados(prev => ({ ...prev, [chave]: erro ? { tipo: 'erro', mensagem: String(erro) } : { tipo: 'salvo' } }))
      },
      () => setEstados(prev => ({ ...prev, [chave]: { tipo: 'erro', mensagem: ERRO_SALVAR } })),
    )
    return promessa
  }, [])

  return { estados, iniciar, acompanhar }
}

/** "Salvando…" / "Salvo" / "Erro" ao lado do campo (a região fica sempre montada para o leitor de tela anunciar). */
export function IndicadorSalvamento({ estado, className }: { estado?: EstadoSalvar; className?: string }) {
  return (
    <span aria-live="polite" className={estado ? cn('flex-none whitespace-nowrap text-[13px]', className) : 'sr-only'}>
      {estado?.tipo === 'salvando' && <span className="text-fg-3">Salvando…</span>}
      {estado?.tipo === 'salvo' && (
        <span className="inline-flex items-center gap-1 text-ok">
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />Salvo
        </span>
      )}
      {estado?.tipo === 'erro' && (
        <span className="inline-flex items-center gap-1 text-danger" title={estado.mensagem}>
          <AlertCircle size={14} aria-hidden="true" />Erro
        </span>
      )}
    </span>
  )
}

/** Linha com a mensagem do erro, logo abaixo da tarefa. */
export function ErroSalvamento({ estado, className }: { estado?: EstadoSalvar; className?: string }) {
  if (estado?.tipo !== 'erro') return null
  return <p role="alert" className={cn('mb-2.5 text-[13px] text-danger', className)}>{estado.mensagem}</p>
}
