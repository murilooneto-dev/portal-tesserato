export type StatusProcedimento = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO'

export const STATUS_PROCEDIMENTO_OPCOES: { valor: StatusProcedimento; label: string }[] = [
  { valor: 'ABERTO', label: 'Aberto' },
  { valor: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { valor: 'CONCLUIDO', label: 'Concluído' },
  { valor: 'CANCELADO', label: 'Cancelado' },
]

export function statusProcedimentoBadge(status: StatusProcedimento): { bg: string; text: string; label: string } {
  if (status === 'CONCLUIDO') return { bg: 'bg-green-500/20', text: 'text-green-300', label: 'CONCLUÍDO' }
  if (status === 'CANCELADO') return { bg: 'bg-red-500/20', text: 'text-red-300', label: 'CANCELADO' }
  if (status === 'EM_ANDAMENTO') return { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: 'EM ANDAMENTO' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'ABERTO' }
}
