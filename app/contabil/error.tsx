'use client'

import ErroPagina from '@/components/shell/ErroPagina'

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroPagina error={error} reset={reset} />
}
