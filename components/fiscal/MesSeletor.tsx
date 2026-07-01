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
  const real = getMesAnoRealAgora()
  const base = new Date(real.ano, real.mes - 1, 1)
  const opcoes = []
  for (let offset = 2; offset >= -23; offset--) {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1)
    const mes = d.getMonth() + 1
    const ano = d.getFullYear()
    opcoes.push({ mes, ano, valor: `${mes}-${ano}`, label: `${MESES_NOME[mes - 1]} ${ano}` })
  }
  return opcoes
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
        <option value={valorAtual}>{MESES_NOME[mes - 1]} {ano}</option>
      )}
      {opcoes.map(o => (
        <option key={o.valor} value={o.valor}>{o.label}</option>
      ))}
    </select>
  )
}
