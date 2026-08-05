import { AlertTriangle } from 'lucide-react'

interface Props {
  locais: string[]
}

export default function ClienteParcelamentoAviso({ locais }: Props) {
  if (locais.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-0.5 whitespace-normal">
      <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
      Cliente Possui Parcelamento ({locais.join(', ')})
    </span>
  )
}
