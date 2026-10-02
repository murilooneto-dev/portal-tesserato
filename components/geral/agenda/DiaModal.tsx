'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTom } from '@/components/ui/Badge'
import { cn } from '@/components/ui/cn'
import { STATUS_ROTULO, contarCompromissos, horaCurta, tomDoCompromisso, type Compromisso, type TomCompromisso } from '@/lib/agenda'
import { PONTO_DO_TOM } from './CalendarioMes'

const SELO: Record<TomCompromisso, BadgeTom> = { warn: 'warn', acc: 'acc', ok: 'ok', neu: 'neu' }

export function DiaModal({ aberto, titulo, ehHoje, itens, hoje, onNovo, onEditar, onExcluir, onFechar }: {
  aberto: boolean
  titulo: string
  ehHoje: boolean
  itens: Compromisso[]
  hoje: Date
  onNovo: () => void
  onEditar: (c: Compromisso) => void
  onExcluir: (c: Compromisso) => void
  onFechar: () => void
}) {
  const [aberta, setAberta] = useState<string | null>(itens[0]?.id ?? null)
  // Compromisso novo criado com o dia aberto aparece expandido (ajuste de estado na renderização).
  const idsAtuais = itens.map(i => i.id).join('|')
  const [idsAnteriores, setIdsAnteriores] = useState(idsAtuais)
  if (idsAnteriores !== idsAtuais) {
    const antes = new Set(idsAnteriores.split('|'))
    const novo = itens.find(i => !antes.has(i.id))
    setIdsAnteriores(idsAtuais)
    if (novo) setAberta(novo.id)
  }
  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      subtitulo={`${ehHoje ? 'Hoje · ' : ''}${contarCompromissos(itens.length)}`}
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar} className="ml-auto">Fechar</Button>
          <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={onNovo}>Novo compromisso</Button>
        </>
      }
    >
      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-3">Nenhum compromisso neste dia.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {itens.map(item => {
            const tom = tomDoCompromisso(item, hoje)
            const expandido = aberta === item.id
            const idDetalhe = `compromisso-${item.id}`
            return (
              <li key={item.id} className="rounded-[10px] border border-line-soft bg-page">
                <button
                  type="button"
                  aria-expanded={expandido}
                  aria-controls={idDetalhe}
                  onClick={() => setAberta(expandido ? null : item.id)}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
                >
                  <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', PONTO_DO_TOM[tom])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-semibold text-fg', item.status === 'cancelado' && 'line-through')}>{item.titulo}</span>
                    {item.hora_compromisso && <span className="text-[13px] text-fg-3">{horaCurta(item.hora_compromisso)}</span>}
                  </span>
                  <Badge tom={SELO[tom]}>{STATUS_ROTULO[item.status]}</Badge>
                  <ChevronDown size={16} aria-hidden="true" className={cn('flex-none text-fg-3 transition-transform', expandido && 'rotate-180')} />
                </button>
                {expandido && (
                  <div id={idDetalhe} className="px-3.5 pb-3.5 pl-[34px] text-[13px] text-fg-2">
                    {item.descricao
                      ? <p className="whitespace-pre-wrap break-words">{item.descricao}</p>
                      : <p className="italic text-fg-3">Sem descrição.</p>}
                    <div className="mt-3 flex gap-2">
                      <Button tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => onEditar(item)}>Editar</Button>
                      <Button tamanho="p" variante="perigo" icone={<Trash2 size={14} aria-hidden="true" />} onClick={() => onExcluir(item)}>Excluir</Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
