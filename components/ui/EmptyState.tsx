import type { ReactNode } from 'react'

export function EmptyState({ icone, titulo, descricao, acao }: {
  icone: ReactNode
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-acc-soft text-acc-text">{icone}</span>
      <p className="text-[15px] font-semibold text-fg">{titulo}</p>
      {descricao && <p className="max-w-[420px] text-sm text-fg-3">{descricao}</p>}
      {acao && <div className="mt-1.5">{acao}</div>}
    </div>
  )
}
