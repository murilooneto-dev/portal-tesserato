import { CalendarRange, Repeat } from 'lucide-react'
import { rotuloSeloConta } from '@/lib/financeiro-movimentos'
import type { FinanceiroFormaPagamento } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'

interface Props {
  conta: {
    recorrencia_id?: string | null
    competencia?: string | null
    tipo_forma?: FinanceiroFormaPagamento | null
  }
}

// Selo "Recorrente" / "Prazo determinado" ao lado do nome, igual em Contas a
// Pagar e em Pagamentos. Lançamento avulso não mostra nada.
export default function SeloConta({ conta }: Props) {
  const rotulo = rotuloSeloConta(conta)
  if (!rotulo) return null
  const Icone = rotulo === 'Recorrente' ? Repeat : CalendarRange
  return <Badge tom="info" icone={<Icone size={12} aria-hidden="true" />} className="flex-none">{rotulo}</Badge>
}
