// components/calendario/CalendarioSetor.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { proximoPrazo, diasRestantes, alertaLabel, labelDatas } from '@/lib/calendario'
import { DIAS_SEMANA, celulasDoMes, chaveDia, chaveDeHoje } from '@/lib/agenda'
import { prazosDoDia, prazosDoMes, tomDoAlerta, ROTULO_PRAZO, type VariantePrazo } from '@/lib/calendario-grade'
import { mesVizinho, rotuloMes } from '@/lib/mes-navegacao'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { cn } from '@/components/ui/cn'
import CalendarioEventoModal from './CalendarioEventoModal'
import type { CalendarioEvento, UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  eventos: CalendarioEvento[]
  isAdmin: boolean
}

const PONTO: Record<VariantePrazo, string> = { interna: 'bg-acc', oficial: 'bg-warn' }
const ETIQUETA: Record<VariantePrazo, string> = { interna: 'bg-acc-soft text-acc-text', oficial: 'bg-warn-soft text-warn' }

export default function CalendarioSetor({ setor, eventos, isAdmin }: Props) {
  const router = useRouter()
  const sb = createClient()
  const confirmar = useConfirmar()

  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<CalendarioEvento | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [hoje] = useState(() => new Date())
  const [visto, setVisto] = useState({ mes: hoje.getMonth() + 1, ano: hoje.getFullYear() })

  const cards = eventos
    .map(evento => ({ evento, alvo: proximoPrazo(evento, hoje) }))
    .filter((c): c is { evento: CalendarioEvento; alvo: Date } => c.alvo !== null)
    .map(({ evento, alvo }) => ({ evento, dias: diasRestantes(alvo, hoje) }))
    .sort((a, b) => a.dias - b.dias)

  const prazos = prazosDoMes(eventos, visto.ano, visto.mes)
  const chaveHoje = chaveDeHoje(hoje)
  const noMesAtual = visto.mes === hoje.getMonth() + 1 && visto.ano === hoje.getFullYear()

  async function handleExcluir(evento: CalendarioEvento) {
    const ok = await confirmar({ titulo: 'Excluir evento?', descricao: `"${evento.titulo}" sai do calendário.`, textoConfirmar: 'Excluir', perigo: true })
    if (!ok) return
    setExcluindoId(evento.id)
    setErro(null)
    const { error } = await sb.from('calendario_eventos').delete().eq('id', evento.id)
    setExcluindoId(null)
    if (error) { setErro(error.message); return }
    router.refresh()
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Calendário"
        subtitulo="Prazos internos e vencimentos oficiais"
        acoes={isAdmin && (
          <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setCriando(true)}>Novo evento</Button>
        )}
      />
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Calendário do mês" className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-soft px-[18px] py-3.5">
            <h2 className="text-[15px] font-semibold text-fg">{rotuloMes(visto.mes, visto.ano)}</h2>
            <ul aria-label="Legenda" className="flex flex-wrap gap-4 text-[13px] text-fg-2">
              {(['interna', 'oficial'] as const).map(v => (
                <li key={v} className="inline-flex items-center gap-[7px]">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', PONTO[v])} />
                  {ROTULO_PRAZO[v]}
                </li>
              ))}
            </ul>
            <div className="ml-auto flex items-center gap-1">
              <Button variante="fantasma" tamanho="p" disabled={noMesAtual} onClick={() => setVisto({ mes: hoje.getMonth() + 1, ano: hoje.getFullYear() })}>Hoje</Button>
              <IconButton rotulo="Mês anterior" icone={<ChevronLeft size={18} aria-hidden="true" />} onClick={() => setVisto(v => mesVizinho(v.mes, v.ano, -1))} />
              <IconButton rotulo="Próximo mês" icone={<ChevronRight size={18} aria-hidden="true" />} onClick={() => setVisto(v => mesVizinho(v.mes, v.ano, 1))} />
            </div>
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 border-b border-line-soft">
            {DIAS_SEMANA.map(d => (
              <span key={d} className="px-1 py-2 text-center text-xs font-semibold uppercase tracking-[.04em] text-fg-3 sm:px-3 sm:text-left">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celulasDoMes(visto.ano, visto.mes).map((dia, i) => {
              const borda = cn('border-b border-line-soft', i % 7 !== 6 && 'border-r')
              if (dia === null) {
                return <div key={i} aria-hidden="true" className={cn(borda, 'h-12 bg-[color-mix(in_srgb,var(--page)_60%,transparent)] sm:h-[104px]')} />
              }
              const doDia = prazosDoDia(prazos, dia)
              const ehHoje = chaveDia(visto.ano, visto.mes, dia) === chaveHoje
              return (
                <div
                  key={i}
                  aria-current={ehHoje ? 'date' : undefined}
                  className={cn(borda, 'flex h-12 min-w-0 flex-col items-center gap-0.5 overflow-hidden px-1 py-1.5 sm:h-[104px] sm:items-stretch sm:px-2.5 sm:py-2', ehHoje && 'bg-acc-soft')}
                >
                  <span className={cn('text-[13px]', ehHoje ? 'grid h-6 w-6 place-items-center rounded-full bg-acc font-bold text-acc-ink' : 'font-medium text-fg-2')}>{dia}</span>
                  <span aria-hidden="true" className="flex gap-0.5 sm:hidden">
                    {doDia.slice(0, 3).map(p => <i key={`${p.evento.id}-${p.variante}`} className={cn('h-[5px] w-[5px] rounded-full', PONTO[p.variante])} />)}
                  </span>
                  <span className="hidden min-w-0 flex-col sm:flex">
                    {doDia.slice(0, 2).map(p => (
                      <span key={`${p.evento.id}-${p.variante}`} title={`${ROTULO_PRAZO[p.variante]}: ${p.evento.titulo}`} className={cn('mt-1 flex h-[22px] min-w-0 items-center rounded-md px-[7px] text-xs', ETIQUETA[p.variante])}>
                        <span className="truncate">{p.evento.titulo}</span>
                      </span>
                    ))}
                    {doDia.length > 2 && <span className="mt-[3px] text-xs text-fg-3">{`+ ${doDia.length - 2} mais`}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-label="Próximos prazos" className="min-w-0 rounded-xl border border-line-soft bg-surface">
          <h2 className="border-b border-line-soft px-[18px] py-3.5 text-[15px] font-semibold text-fg">Próximos prazos</h2>
          {cards.length === 0 ? (
            <EmptyState icone={<CalendarDays size={22} />} titulo="Nenhum evento cadastrado ainda" descricao={isAdmin ? 'Crie o primeiro em "Novo evento".' : undefined} />
          ) : (
            <ul className="divide-y divide-line-soft">
              {cards.map(({ evento, dias }) => (
                <li key={evento.id} className="flex flex-col gap-1.5 px-[18px] py-3.5">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-fg">{evento.titulo}</span>
                    <Badge tom={tomDoAlerta(dias)}>{alertaLabel(dias).text}</Badge>
                  </div>
                  <p className="text-[13px] text-fg-2">{labelDatas(evento, hoje)}</p>
                  {evento.descricao && <p className="text-[13px] leading-relaxed text-fg-3">{evento.descricao}</p>}
                  {isAdmin && (
                    <div className="-ml-2 flex items-center gap-1">
                      <IconButton rotulo={`Editar ${evento.titulo}`} icone={<Pencil size={16} aria-hidden="true" />} onClick={() => setEditando(evento)} />
                      <IconButton rotulo={`Excluir ${evento.titulo}`} icone={<Trash2 size={16} aria-hidden="true" />} disabled={excluindoId === evento.id} onClick={() => handleExcluir(evento)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {criando && <CalendarioEventoModal setor={setor} evento={null} onClose={() => setCriando(false)} />}
      {editando && <CalendarioEventoModal setor={setor} evento={editando} onClose={() => setEditando(null)} />}
    </Pagina>
  )
}
