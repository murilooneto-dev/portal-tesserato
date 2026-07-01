// components/fiscal/MesSeletor.tsx

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirMesAno } from '@/lib/mes-atual-actions'

const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  mes: number
  ano: number
}

export default function MesSeletor({ mes, ano }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function trocar(novoMes: number, novoAno: number) {
    startTransition(async () => {
      await definirMesAno(novoMes, novoAno)
      router.refresh()
    })
  }

  function anterior() {
    if (mes === 1) trocar(12, ano - 1)
    else trocar(mes - 1, ano)
  }

  function proximo() {
    if (mes === 12) trocar(1, ano + 1)
    else trocar(mes + 1, ano)
  }

  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/8">
      <button
        onClick={anterior}
        disabled={isPending}
        className="text-white/40 hover:text-white transition-colors px-1.5 disabled:opacity-30"
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <span className="text-white/70 text-[11px] font-medium whitespace-nowrap">
        {MESES_ABR[mes - 1]} · {ano}
      </span>
      <button
        onClick={proximo}
        disabled={isPending}
        className="text-white/40 hover:text-white transition-colors px-1.5 disabled:opacity-30"
        aria-label="Próximo mês"
      >
        ›
      </button>
    </div>
  )
}
