import { cn } from './cn'

// Bolinha com a inicial do usuário na cor do perfil. Sem cor cadastrada, usa
// a cor de destaque.
export function Avatar({ nome, cor, tamanho = 24, className }: {
  nome: string | null | undefined
  cor?: string | null
  tamanho?: number
  className?: string
}) {
  const inicial = (nome ?? '').trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className={cn('grid flex-none place-items-center rounded-full font-semibold text-acc-ink', className)}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(12, Math.round(tamanho * 0.5)), backgroundColor: cor || 'var(--acc)' }}
    >
      {inicial}
    </span>
  )
}
