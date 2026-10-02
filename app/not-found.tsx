import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export default function NaoEncontrada() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4">
      <EmptyState
        icone={<SearchX size={24} />}
        titulo="Página não encontrada"
        descricao="O endereço pode ter mudado ou a página foi removida."
        acao={<Link href="/intranet" className="inline-flex h-9 items-center rounded-lg bg-acc px-3.5 text-sm font-semibold text-acc-ink">Ir para o Início</Link>}
      />
    </main>
  )
}
