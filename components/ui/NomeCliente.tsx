import type { ReactNode } from 'react'

// Regra do redesign: o nome do cliente nunca quebra linha. Se não couber,
// corta com reticências mantendo pelo menos 15 caracteres visíveis, e o nome
// completo aparece ao passar o mouse.
export function NomeCliente({ nome, cnpj, depoisDoNome, abaixo }: {
  nome: string
  cnpj?: string | null
  depoisDoNome?: ReactNode
  abaixo?: ReactNode
}) {
  const texto = (nome ?? '').trim() || 'Sem nome'
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 leading-tight">
        <span className="truncate min-w-[15ch] font-semibold text-fg" title={texto}>{texto}</span>
        {depoisDoNome}
      </div>
      {cnpj !== undefined && (
        <div className="mt-0.5 truncate font-mono text-[13px] text-fg-3">{cnpj?.trim() || 'CNPJ não informado'}</div>
      )}
      {abaixo}
    </div>
  )
}
