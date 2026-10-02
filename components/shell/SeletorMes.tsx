'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
    <div role="group" aria-label="Mês de trabalho" aria-busy={pendente || undefined} className="flex h-9 items-center rounded-[10px] border border-line bg-surface">
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
  )
}
