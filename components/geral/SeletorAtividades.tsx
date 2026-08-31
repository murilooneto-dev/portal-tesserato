'use client'

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
    return <p className="text-[var(--fg)]/20 text-xs">Nenhuma atividade cadastrada no catálogo.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {todas.map(nome => (
        <label key={nome} className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={valores.includes(nome)}
            onChange={() => toggle(nome)}
            className="w-3.5 h-3.5 accent-[var(--accent)]"
            disabled={readOnly}
          />
          <span className="text-[var(--fg)]/60 text-xs">
            {nome}{extras.includes(nome) ? ' (atual)' : ''}
          </span>
        </label>
      ))}
    </div>
  )
}
