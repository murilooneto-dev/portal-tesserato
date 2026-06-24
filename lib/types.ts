export type UserRole = 'admin' | 'operador'
export type UserSetor = 'fiscal' | 'contabil' | 'pessoal' | 'societario' | 'financeiro'
export type BotTipo = 'iss' | 'siga' | 'mei'
export type BotStatus = 'processado' | 'erro'

export interface Profile {
  id: string
  nome: string
  role: UserRole
  setor: UserSetor
  cor: string
  created_at: string
}

export interface Cliente {
  id: string
  cod: string | null
  nome: string
  cnpj: string | null
  regime: string | null
  atividade: string | null
  responsavel: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  mit: string | null
  created_at: string
}

export interface Tarefa {
  id: string
  cliente_id: string
  usuario_id: string | null
  mes: number
  ano: number
  tipo: string
  concluida: boolean
  concluida_em: string | null
  created_at: string
}

export interface LinkRapido {
  id: string
  titulo: string
  url: string
  logo_url: string | null
  ordem: number
  ativo: boolean
}

export interface BotConfig {
  id: string
  usuario_id: string
  bot: BotTipo
  pasta_downloads: string
  email_remetente: string
  email_destinatario: string
}

export interface BotEvento {
  id: string
  bot: BotTipo
  arquivo: string
  status: BotStatus
  mensagem: string | null
  processado_em: string
}
