// components/fiscal/MesSeletor.tsx

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirMesAno } from '@/lib/mes-atual-actions'
import { getMesAnoRealAgora } from '@/lib/mes-atual'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface Props {
  mes: number
  ano: number
}

function gerarOpcoes(): { mes: number; ano: number; valor: string; label: string }[] {
  const { ano } = getMesAnoRealAgora()
  return MESES_NOME.map((nome, i) => {
    const mes = i + 1
    return { mes, ano, valor: `${mes}-${ano}`, label: nome }
  })
}

export default function MesSeletor({ mes, ano }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const opcoes = gerarOpcoes()
  const valorAtual = `${mes}-${ano}`

  function selecionar(valor: string) {
    const [novoMes, novoAno] = valor.split('-').map(Number)
    startTransition(async () => {
      await definirMesAno(novoMes, novoAno)
      router.refresh()
    })
  }

  return (
    <select
      value={valorAtual}
      disabled={isPending}
      onChange={e => selecionar(e.target.value)}
      className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-white/70 text-[11px] font-medium disabled:opacity-50"
    >
      {!opcoes.some(o => o.valor === valorAtual) && (
        <option value={valorAtual} className="bg-[#162444]">{MESES_NOME[mes - 1]} {ano}</option>
      )}
      {opcoes.map(o => (
        <option key={o.valor} value={o.valor} className="bg-[#162444]">{o.label}</option>
      ))}
    </select>
  )
}
