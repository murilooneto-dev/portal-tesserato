import Image from 'next/image'
import type { ReactNode } from 'react'

// Moldura das telas fora do portal (login e redefinir senha).
export function TelaAcesso({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3.5">
          <Image src="/logo.png" alt="" width={72} height={72} className="rounded-[18px]" unoptimized priority />
          <div className="text-center">
            <p className="text-xl font-semibold text-fg">Tesserato Contabilidade</p>
            <p className="mt-0.5 text-[13px] text-fg-3">Portal do Colaborador</p>
          </div>
        </div>
        <div className="rounded-xl border border-line-soft bg-surface p-6 sm:p-7">{children}</div>
        {rodape}
      </div>
    </main>
  )
}
