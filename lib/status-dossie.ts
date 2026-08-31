export type StatusDossie = 'NAO_POSSUI' | 'EM_ATUALIZACAO' | 'CONCLUIDO'

export const STATUS_DOSSIE_OPCOES: { valor: StatusDossie; label: string }[] = [
  { valor: 'NAO_POSSUI', label: 'Não Possui' },
  { valor: 'EM_ATUALIZACAO', label: 'Em Atualização' },
  { valor: 'CONCLUIDO', label: 'Concluído' },
]
