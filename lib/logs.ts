import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from '@/lib/types'

export type TipoEvento = 'criacao' | 'edicao' | 'exclusao' | 'desabilitacao' | 'reabilitacao' | 'troca_responsavel'

// Nomes amigáveis pros campos mais comuns dos cadastros de cliente —
// campo sem entrada aqui aparece com o próprio nome da coluna no log.
const LABEL_CAMPO: Record<string, string> = {
  nome: 'Razão Social',
  cnpj: 'CNPJ',
  mit: 'Município/UF',
  municipio: 'Município',
  uf: 'UF',
  contato_chat: 'Contato',
  cod: 'Código',
  regime: 'Regime',
  atividade: 'Atividade',
  prioridade: 'Prioridade',
  declaracao_anual: 'Declaração anual',
  confere_siga: 'Confere SIGA',
  faz_dossie: 'Dossiê',
  envia_iss: 'Configuração ISS',
  login_iss: 'Configuração ISS',
  senha_iss: 'Configuração ISS',
  email_envio_iss: 'Configuração ISS',
  tarefas_personalizadas: 'Tarefas',
  tarefas_excluidas: 'Tarefas',
  setores: 'Setores',
}

// Campos que nunca entram no diff de 'edicao' — responsavel tem seu
// próprio evento mais específico (trocarResponsavel), e ids/timestamps
// não são "dado do cadastro" pro usuário.
const CAMPOS_IGNORADOS = new Set(['responsavel', 'cliente_id', 'id', 'created_at', 'updated_at'])

function diferente(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) !== JSON.stringify(b ?? [])
  return (a ?? null) !== (b ?? null)
}

// Compara "antes" (linha atual no banco) com "depois" (payload que está
// sendo salvo) e devolve os nomes amigáveis dos campos que mudaram de
// verdade — só olha as chaves presentes em `depois` (o payload de save já
// define o que é editável nessa tela).
export function camposAlterados(antes: Record<string, unknown> | null | undefined, depois: Record<string, unknown>): string[] {
  const nomes = new Set<string>()
  for (const campo of Object.keys(depois)) {
    if (CAMPOS_IGNORADOS.has(campo)) continue
    if (diferente(antes?.[campo], depois[campo])) {
      nomes.add(LABEL_CAMPO[campo] ?? campo)
    }
  }
  return Array.from(nomes)
}

interface RegistrarEventoParams {
  setor: UserSetor | null
  clienteId: string | null
  clienteNome: string
  tipoEvento: TipoEvento
  usuarioId: string | null
  usuarioNome: string
  detalhes?: Record<string, unknown>
}

export async function registrarEvento(supabase: SupabaseClient, params: RegistrarEventoParams) {
  await supabase.from('evento_log').insert({
    setor: params.setor,
    cliente_id: params.clienteId,
    cliente_nome: params.clienteNome,
    tipo_evento: params.tipoEvento,
    usuario_id: params.usuarioId,
    usuario_nome: params.usuarioNome,
    detalhes: params.detalhes ?? null,
  })
}

interface RegistrarEdicaoParams {
  setor: UserSetor | null
  clienteId: string
  clienteNome: string
  usuarioId: string | null
  usuarioNome: string
  campos: string[]
}

export async function registrarEdicao(supabase: SupabaseClient, params: RegistrarEdicaoParams) {
  if (params.campos.length === 0) return
  await registrarEvento(supabase, {
    setor: params.setor,
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    tipoEvento: 'edicao',
    usuarioId: params.usuarioId,
    usuarioNome: params.usuarioNome,
    detalhes: { campos: params.campos },
  })
}

interface AbrirHistoricoResponsavelParams {
  clienteId: string
  setor: UserSetor
  responsavel: string
  usuarioId: string | null
  usuarioNome: string
}

export async function abrirHistoricoResponsavel(supabase: SupabaseClient, params: AbrirHistoricoResponsavelParams) {
  await supabase.from('cliente_responsavel_historico').insert({
    cliente_id: params.clienteId,
    setor: params.setor,
    responsavel: params.responsavel,
    usuario_id: params.usuarioId,
    usuario_nome: params.usuarioNome,
  })
}

interface TrocarResponsavelParams {
  clienteId: string
  clienteNome: string
  setor: UserSetor
  responsavelAntigo: string | null | undefined
  responsavelNovo: string | null | undefined
  usuarioId: string | null
  usuarioNome: string
}

// Fecha o período de vigência aberto (se houver) e abre um novo com o
// responsável atual. Não faz nada se o responsável não mudou de fato —
// evita gerar linha de log/histórico a cada save sem alteração real.
export async function trocarResponsavel(supabase: SupabaseClient, params: TrocarResponsavelParams) {
  const antigo = params.responsavelAntigo || null
  const novo = params.responsavelNovo || null
  if (antigo === novo) return

  await supabase
    .from('cliente_responsavel_historico')
    .update({ data_fim: new Date().toISOString() })
    .eq('cliente_id', params.clienteId)
    .eq('setor', params.setor)
    .is('data_fim', null)

  if (novo) {
    await abrirHistoricoResponsavel(supabase, {
      clienteId: params.clienteId,
      setor: params.setor,
      responsavel: novo,
      usuarioId: params.usuarioId,
      usuarioNome: params.usuarioNome,
    })
  }

  await registrarEvento(supabase, {
    setor: params.setor,
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    tipoEvento: 'troca_responsavel',
    usuarioId: params.usuarioId,
    usuarioNome: params.usuarioNome,
    detalhes: { responsavel_antigo: antigo, responsavel_novo: novo },
  })
}
