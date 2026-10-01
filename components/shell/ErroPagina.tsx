'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export default function ErroPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="px-4 py-10 sm:px-8">
      <EmptyState
        icone={<AlertTriangle size={24} />}
        titulo="Não foi possível abrir esta página"
        descricao="Tente de novo. Se continuar, avise o administrador do portal."
        acao={
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button variante="primario" onClick={reset}>Tentar de novo</Button>
            <Link href="/intranet" className="text-sm font-medium text-acc-text hover:underline">Voltar ao Início</Link>
          </div>
        }
      />
    </div>
  )
}
