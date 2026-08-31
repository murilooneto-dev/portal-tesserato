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
  contabil: '/contabil/dashboard',
  pessoal: '/pessoal/dashboard',
  societario: '/societario/procedimentos',
  financeiro: '/financeiro',
}

export interface Profile {
  id: string
  nome: string
  role: UserRole
  setores: UserSetor[]
  cor: string
  created_at: string
  paginas_acesso: string[]
}

export interface Cliente {
  id: string
  nome: string
  cnpj: string | null
  mit: string | null
  municipio: string | null
  uf: string | null
  contato_chat: string | null
  setores: UserSetor[]
  tarefas_vinculadas_ativas: string[]
  created_at: string
}

export interface ClienteFiscal {
  cliente_id: string
  cod: string | null
  regime: string | null
  atividade: string[]
  responsavel: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  declaracao_anual: boolean
  tarefas_personalizadas: string[]
  ativo: boolean
  faz_dossie: boolean
  dossie_status: 'NAO_POSSUI' | 'EM_ATUALIZACAO' | 'CONCLUIDO'
  dossie_finalizado: boolean
}

export interface Tarefa {
  id: string
  cliente_id: string
  usuario_id: string | null
  setor: UserSetor
  mes: number
  ano: number
  tipo: string
  concluida: boolean
  concluida_em: string | null
  resposta_texto: string | null
  recebido: boolean
  importado: boolean
  conferido: boolean
  created_at: string
  parcelamento_id: string | null
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

export interface ClienteContabil {
  cliente_id: string
  atividade: string[]
  regime: string | null
  responsavel: string | null
  prioridade: number
  obs: string | null
  tarefas_personalizadas: string[]
  ativo: boolean
}

export interface ClientePessoal {
  cliente_id: string
  atividade: string[]
  regime: string | null
  responsavel: string | null
  prioridade: number
  obs: string | null
  tarefas_personalizadas: string[]
  ativo: boolean
}

export interface TarefaTipo {
  id: string
  setor: UserSetor
  nome: string
  etapas: string[] | null
  meses_visiveis: number[] | null
  tipo_resposta: TipoResposta
  ativo: boolean
  padrao: boolean
}

export interface TarefaEtapa {
  id: string
  tarefa_id: string
  nome: string
  concluida: boolean
  concluida_em: string | null
  ordem: number
}

export type TipoDataEvento = 'recorrente' | 'unica'

export type TipoResposta = 'data' | 'texto'

export interface CalendarioEvento {
  id: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  tipo_data: TipoDataEvento
  interna_dia_mes: number | null
  interna_data: string | null
  oficial_dia_mes: number | null
  oficial_data: string | null
  created_at: string
  created_by: string | null
}

export interface TarefaVinculo {
  id: string
  setor_origem: UserSetor
  tipo_origem: string
  setor_destino: UserSetor
  tipo_destino: string
  created_at: string
}

export interface TarefaAvulsa {
  id: string
  cliente_id: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  data: string
  criado_por: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
}

export interface TarefaArquivo {
  id: string
  tarefa_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}

export interface EventoArquivo {
  id: string
  evento_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}

export interface ProcedimentoArquivo {
  id: string
  procedimento_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}
