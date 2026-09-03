import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from '@/lib/types'

export type TipoEvento = 'criacao' | 'exclusao' | 'desabilitacao' | 'reabilitacao' | 'troca_responsavel'

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
