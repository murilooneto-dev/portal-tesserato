import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from '@/lib/types'
import { diffTarefas, type DetalhesTarefas } from '@/lib/logs-tarefas'

export type TipoEvento = 'criacao' | 'edicao' | 'exclusao' | 'desabilitacao' | 'reabilitacao' | 'troca_responsavel' | 'tarefas'

interface RegistrarEventoParams {
  setor: UserSetor | null
  clienteId: string | null
  // null em evento de item sem cliente (ex.: criação/exclusão de usuário)
  clienteNome: string | null
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

interface RegistrarEventoTarefasParams {
  setor: UserSetor | null
  clienteId: string
  clienteNome: string
  usuarioId: string | null
  usuarioNome: string
  detalhes: DetalhesTarefas
}

export async function registrarEventoTarefas(supabase: SupabaseClient, params: RegistrarEventoTarefasParams) {
  await registrarEvento(supabase, {
    setor: params.setor,
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    tipoEvento: 'tarefas',
    usuarioId: params.usuarioId,
    usuarioNome: params.usuarioNome,
    detalhes: params.detalhes as unknown as Record<string, unknown>,
  })
}

interface RegistrarMudancaTarefasParams {
  setor: UserSetor
  clienteId: string
  clienteNome: string
  usuarioId: string | null
  usuarioNome: string
  // Lista completa de tarefas do cliente (configuradas + personalizadas,
  // ver calcularTarefasEsperadas) antes e depois do save. `antes` null =
  // cliente/setor novo, tudo entra como adicionado.
  antes: string[] | null
  depois: string[]
}

// Não grava nada se a lista de tarefas não mudou de fato.
export async function registrarMudancaTarefas(supabase: SupabaseClient, params: RegistrarMudancaTarefasParams) {
  const { adicionadas, removidas } = diffTarefas(params.antes, params.depois)
  if (adicionadas.length === 0 && removidas.length === 0) return
  await registrarEventoTarefas(supabase, {
    setor: params.setor,
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    usuarioId: params.usuarioId,
    usuarioNome: params.usuarioNome,
    detalhes: {
      acao: 'cliente',
      ...(adicionadas.length ? { adicionadas } : {}),
      ...(removidas.length ? { removidas } : {}),
    },
  })
}
