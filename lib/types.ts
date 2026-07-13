export type UserRole = 'admin' | 'operador'
export type UserSetor = 'fiscal' | 'contabil' | 'pessoal' | 'societario' | 'financeiro'
export type BotTipo = 'iss' | 'siga' | 'mei'
export type BotStatus = 'processado' | 'erro'

export const SETORES: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

export const SETOR_LABEL: Record<UserSetor, string> = {
  fiscal: 'Fiscal',
  contabil: 'Contábil',
  pessoal: 'Pessoal',
  societario: 'Societário',
  financeiro: 'Financeiro',
}

export const SETOR_HOME: Record<UserSetor, string> = {
  fiscal: '/fiscal/dashboard',
  contabil: '/contabil',
  pessoal: '/pessoal',
  societario: '/societario',
  financeiro: '/financeiro',
}

export interface Profile {
  id: string
  nome: string
  role: UserRole
  setores: UserSetor[]
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
  contato_chat: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  mit: string | null
  municipio: string | null
  uf: string | null
  envia_iss: boolean | null
  confere_siga: boolean | null
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  declaracao_anual: string | null
  tarefas_personalizadas: string[] | null
  setores: UserSetor[]
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
  recebido: boolean
  importado: boolean
  conferido: boolean
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
