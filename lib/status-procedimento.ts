import type { BadgeTom } from '@/components/ui/Badge'

export type StatusProcedimento = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO'

export const STATUS_PROCEDIMENTO_OPCOES: { valor: StatusProcedimento; label: string }[] = [
  { valor: 'ABERTO', label: 'Aberto' },
  { valor: 'EM_ANDAMENTO', label: 'Em andamento' },
  { valor: 'CONCLUIDO', label: 'Concluído' },
  { valor: 'CANCELADO', label: 'Cancelado' },
]

// Tom do selo de situação no desenho novo: Aberto azul, Em andamento âmbar,
// Concluído verde, Cancelado neutro.
export function tomStatusProcedimento(status: StatusProcedimento): BadgeTom {
  if (status === 'CONCLUIDO') return 'ok'
  if (status === 'EM_ANDAMENTO') return 'warn'
  if (status === 'CANCELADO') return 'neu'
  return 'info'
}

export function rotuloStatusProcedimento(status: StatusProcedimento): string {
  return STATUS_PROCEDIMENTO_OPCOES.find(o => o.valor === status)?.label ?? status
}
