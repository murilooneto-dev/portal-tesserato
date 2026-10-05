import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClassName } from '@/components/ui/Button'

export default function NaoEncontrada() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4">
      <EmptyState
        icone={<SearchX size={24} />}
        titulo="Página não encontrada"
        descricao="O endereço pode ter mudado ou a página foi removida."
        acao={<Link href="/intranet" className={buttonClassName({ variante: 'primario' })}>Ir para o Início</Link>}
      />
    </main>
  )
}
