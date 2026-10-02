import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { rotuloMes } from '@/lib/mes-navegacao'
import {
  DIAS_SEMANA, celulasDoMes, chaveDia, chaveDeHoje, compromissosDoDia, contarCompromissos, horaCurta,
  tituloDoDia, tomDoCompromisso, type Compromisso, type TomCompromisso,
} from '@/lib/agenda'

export const PONTO_DO_TOM: Record<TomCompromisso, string> = { warn: 'bg-warn', acc: 'bg-acc', ok: 'bg-ok', neu: 'bg-fg-3' }
const ETIQUETA: Record<TomCompromisso, string> = {
  warn: 'bg-warn-soft text-warn',
  acc: 'bg-acc-soft text-acc-text',
  ok: 'bg-ok-soft text-ok',
  neu: 'bg-neutral-soft text-fg-3',
}
const LEGENDA: [TomCompromisso, string][] = [['warn', 'Pendente em até 3 dias'], ['acc', 'Pendente'], ['ok', 'Concluído'], ['neu', 'Cancelado']]

export function CalendarioMes({ ano, mes, hoje, itens, onAbrirDia, onMesAnterior, onProximoMes, onHoje }: {
  ano: number
  mes: number
  hoje: Date
  itens: Compromisso[]
  onAbrirDia: (dia: number) => void
  onMesAnterior: () => void
  onProximoMes: () => void
  onHoje: () => void
}) {
  const chaveHoje = chaveDeHoje(hoje)
  return (
    <section aria-label="Calendário do mês" className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-soft px-[18px] py-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{`Minha agenda · ${rotuloMes(mes, ano)}`}</h2>
        <ul aria-label="Legenda" className="hidden flex-wrap gap-4 text-[13px] text-fg-2 lg:flex">
          {LEGENDA.map(([tom, texto]) => (
            <li key={tom} className="inline-flex items-center gap-[7px]">
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', PONTO_DO_TOM[tom])} />
              {texto}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <Button variante="fantasma" tamanho="p" onClick={onHoje}>Hoje</Button>
          <IconButton rotulo="Mês anterior" icone={<ChevronLeft size={18} aria-hidden="true" />} onClick={onMesAnterior} />
          <IconButton rotulo="Próximo mês" icone={<ChevronRight size={18} aria-hidden="true" />} onClick={onProximoMes} />
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 border-b border-line-soft">
        {DIAS_SEMANA.map(d => (
          <span key={d} className="px-1 py-2 text-center text-xs font-semibold uppercase tracking-[.04em] text-fg-3 sm:px-3 sm:text-left">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celulasDoMes(ano, mes).map((dia, i) => {
          const borda = cn('border-b border-line-soft', i % 7 !== 6 && 'border-r')
          if (dia === null) {
            return <div key={i} aria-hidden="true" className={cn(borda, 'h-12 bg-[color-mix(in_srgb,var(--page)_60%,transparent)] sm:h-[104px]')} />
          }
          const chave = chaveDia(ano, mes, dia)
          const doDia = compromissosDoDia(itens, chave)
          const ehHoje = chave === chaveHoje
          return (
            <button
              key={i}
              type="button"
              onClick={() => onAbrirDia(dia)}
              aria-label={`${tituloDoDia(ano, mes, dia)}: ${contarCompromissos(doDia.length).toLowerCase()}`}
              aria-current={ehHoje ? 'date' : undefined}
              className={cn(
                borda,
                'flex h-12 min-w-0 flex-col items-center gap-0.5 overflow-hidden px-1 py-1.5 text-left transition-colors hover:bg-raised',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc sm:h-[104px] sm:items-stretch sm:px-2.5 sm:py-2',
                ehHoje && 'bg-acc-soft',
              )}
            >
              <span className={cn('text-[13px]', ehHoje ? 'grid h-6 w-6 place-items-center rounded-full bg-acc font-bold text-acc-ink' : 'font-medium text-fg-2')}>{dia}</span>
              <span aria-hidden="true" className="flex gap-0.5 sm:hidden">
                {doDia.slice(0, 3).map(item => (
                  <i key={item.id} className={cn('h-[5px] w-[5px] rounded-full', PONTO_DO_TOM[tomDoCompromisso(item, hoje)])} />
                ))}
              </span>
              <span aria-hidden="true" className="hidden min-w-0 flex-col sm:flex">
                {doDia.slice(0, 2).map(item => (
                  <span
                    key={item.id}
                    className={cn('mt-1 flex h-[22px] min-w-0 items-center gap-1.5 rounded-md px-[7px] text-xs', ETIQUETA[tomDoCompromisso(item, hoje)], item.status === 'cancelado' && 'line-through')}
                  >
                    {item.hora_compromisso && <b className="flex-none font-semibold">{horaCurta(item.hora_compromisso)}</b>}
                    <span className="truncate">{item.titulo}</span>
                  </span>
                ))}
                {doDia.length > 2 && <span className="mt-[3px] text-xs text-fg-3">{`+ ${doDia.length - 2} mais`}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
