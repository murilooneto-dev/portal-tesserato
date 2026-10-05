'use client'

import { useRouter } from 'next/navigation'
import { Segmentado } from '@/components/ui'
import type { VisaoDashboard } from '@/lib/dashboard-meu'

// Alternador Setor | Meu: o estado mora na URL (?visao=meu), então a escolha
// sobrevive a recarregar e dá para mandar o link.
// `base` é a rota do dashboard do setor (Fiscal por padrão; Contábil e Pessoal passam a sua).
export default function DashboardVisao({ visao, base = '/fiscal/dashboard' }: { visao: VisaoDashboard; base?: string }) {
  const router = useRouter()
  return (
    <Segmentado<VisaoDashboard>
      rotulo="Visão do dashboard"
      valor={visao}
      opcoes={[{ valor: 'setor', rotulo: 'Setor' }, { valor: 'meu', rotulo: 'Meu' }]}
      onMudar={v => router.push(v === 'meu' ? `${base}?visao=meu` : base)}
      className="h-11 w-full sm:h-9 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none sm:[&>button]:min-w-[84px]"
    />
  )
}
