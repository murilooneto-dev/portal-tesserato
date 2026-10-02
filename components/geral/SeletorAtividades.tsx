'use client'

import { Chip } from '@/components/ui/Chip'

interface Props {
  valores: string[]
  opcoes: string[]
  onChange: (novos: string[]) => void
  readOnly?: boolean
}

export default function SeletorAtividades({ valores, opcoes, onChange, readOnly = false }: Props) {
  const extras = valores.filter(v => !opcoes.includes(v))
  const todas = [...opcoes, ...extras]

  function toggle(nome: string) {
    if (readOnly) return
    onChange(valores.includes(nome) ? valores.filter(v => v !== nome) : [...valores, nome])
  }

  if (todas.length === 0) {
    return <p className="text-xs text-fg-3">Nenhuma atividade cadastrada no catálogo.</p>
  }

  return (
    <div role="group" aria-label="Atividades" className="flex flex-wrap gap-2">
      {todas.map(nome => (
        <Chip key={nome} ativo={valores.includes(nome)} onClick={() => toggle(nome)} disabled={readOnly}
          className="h-auto min-h-[30px] max-w-full flex-initial whitespace-normal py-1 text-left">
          <span className="min-w-0 break-words">{nome}{extras.includes(nome) ? ' (atual)' : ''}</span>
        </Chip>
      ))}
    </div>
  )
}
