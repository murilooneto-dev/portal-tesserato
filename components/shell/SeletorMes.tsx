'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { definirMesAno } from '@/lib/mes-atual-actions'
import { MESES, mesVizinho } from '@/lib/mes-navegacao'

export default function SeletorMes({ mes, ano }: { mes: number; ano: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  // Trava síncrona: dois cliques antes do botão ficar desabilitado partiriam
  // do mesmo mês e o segundo pularia um mês.
  const ocupado = useRef(false)

  function ir(novoMes: number, novoAno: number) {
    if (ocupado.current) return
    ocupado.current = true
    iniciar(async () => {
      try {
        await definirMesAno(novoMes, novoAno)
        router.refresh()
      } finally {
        ocupado.current = false
      }
    })
  }

  // Área de toque de 44 px sem aumentar a barra do topo.
  const SETA = "relative h-[34px] w-8 after:absolute after:-inset-x-1.5 after:-inset-y-[5px] after:content-['']"

  const anterior = mesVizinho(mes, ano, -1)
  const proximo = mesVizinho(mes, ano, 1)

  return (
    <>
    {/* Celular (nav-03): só o mês abreviado; o toque abre a lista nativa de meses. */}
    <div className="relative inline-flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-semibold text-fg has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-acc sm:hidden" aria-busy={pendente || undefined}>
      <Calendar size={18} aria-hidden="true" className="text-fg-2" />
      <span aria-hidden="true">{MESES[mes - 1].slice(0, 3)}</span>
      <select
        aria-label={`Mês de trabalho: ${MESES[mes - 1]} ${ano}`}
        value={mes}
        disabled={pendente}
        onChange={e => ir(Number(e.target.value), ano)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[10px] opacity-0 focus:outline-none disabled:cursor-not-allowed"
      >
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1} className="bg-surface text-fg">{nome} {ano}</option>
        ))}
      </select>
    </div>
    <div role="group" aria-label="Mês de trabalho" aria-busy={pendente || undefined} className="hidden h-9 items-center rounded-[10px] border border-line bg-surface sm:flex">
      <IconButton rotulo="Mês anterior" icone={<ChevronLeft size={16} aria-hidden="true" />} onClick={() => ir(anterior.mes, anterior.ano)} disabled={pendente} className={SETA} />
      <select
        aria-label="Escolher mês"
        value={mes}
        disabled={pendente}
        onChange={e => ir(Number(e.target.value), ano)}
        className="h-[34px] min-w-[120px] cursor-pointer appearance-none bg-transparent px-1 text-center text-sm font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-60 sm:min-w-[140px]"
      >
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1} className="bg-surface text-fg">{nome} {ano}</option>
        ))}
      </select>
      <IconButton rotulo="Próximo mês" icone={<ChevronRight size={16} aria-hidden="true" />} onClick={() => ir(proximo.mes, proximo.ano)} disabled={pendente} className={SETA} />
    </div>
    </>
  )
}
