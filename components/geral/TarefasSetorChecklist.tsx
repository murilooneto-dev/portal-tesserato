'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Check, ListChecks } from 'lucide-react'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'
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
type EstadoSalvar = { tipo: 'salvando' } | { tipo: 'salvo' } | { tipo: 'erro'; mensagem: string }

interface Props {
  tarefas: TarefaSetorAplicavel[]
  etapas: TarefaEtapa[]
  podeEditar: boolean
  mes: number
  /** "Salvo automaticamente" à direita do título (Societário). */
  avisoSalvoAutomatico?: boolean
  className?: string
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<Resultado>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<Resultado>
  onSalvarTexto: (tipo: string, texto: string) => Promise<Resultado>
}

export default function TarefasSetorChecklist({
  tarefas, etapas, podeEditar, mes, avisoSalvoAutomatico = false, className, onToggle, onAtualizarEtapa, onSalvarTexto,
}: Props) {
  const [, startTransition] = useTransition()
  const [textoDraft, setTextoDraft] = useState<Record<string, string>>({})
  const [dataDraft, setDataDraft] = useState<Record<string, string>>({})
  const [etapaDraft, setEtapaDraft] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<Record<string, EstadoSalvar>>({})

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
          {tarefas.map(t => {
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
          })}
        </div>
      )}
    </Card>
  )
}
