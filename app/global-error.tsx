'use client'

import { useEffect } from 'react'
import './globals.css'

// Erro no layout raiz (a casca não chegou a montar). Precisa do próprio <html>.
export default function ErroGeral({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <html lang="pt-BR">
      <body className="grid min-h-dvh place-items-center bg-page px-4 text-fg">
        <title>Erro — Tesserato</title>
        <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
          <p className="text-[15px] font-semibold">Não foi possível abrir o portal</p>
          <p className="text-sm text-fg-3">Tente de novo. Se continuar, avise o administrador do portal.</p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-1 inline-flex h-9 items-center rounded-lg bg-acc px-3.5 text-sm font-semibold text-acc-ink"
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  )
}
