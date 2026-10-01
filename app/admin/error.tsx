'use client'

import ErroPagina from '@/components/shell/ErroPagina'

export default function Erro({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErroPagina error={error} tentarDeNovo={unstable_retry} />
}
