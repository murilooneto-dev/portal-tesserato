'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarTarefaTipoSocietario } from '@/lib/supabase/server'
import { tarefaEsperadaNoPeriodo } from '@/lib/tarefas-societario-periodicidade'
import type { Tarefa, TarefaEtapa, TipoResposta } from '@/lib/types'

export interface TarefaSocietarioAplicavel {
  tarefaTipoId: string
  nome: string
  tipoResposta: TipoResposta
  etapas: string[] | null
  responsavelId: string | null
  tarefa: Tarefa | null
}

// Junta os vínculos do cliente (entidade_tipo='cliente' em
// tarefa_tipo_vinculos) com o catálogo de tarefa_tipos do Societário,
// filtra pelas que são esperadas no período (periodicidade + não-
// retroatividade do vínculo) e traz a linha em `tarefas` já lançada nesse
// mês/ano, se existir.
export async function listarTarefasSocietarioDoCliente(
  clienteId: string,
  mes: number,
  ano: number,
): Promise<{ data: TarefaSocietarioAplicavel[]; error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { data: [], error: 'Sessão inválida.' }

  const { data: vinculosRaw, error: vinculosError } = await supabase
    .from('tarefa_tipo_vinculos')
    .select('created_at, tarefa_tipos!inner(id, nome, tipo_resposta, etapas, meses_visiveis, ativo, setor, responsavel_id)')
    .eq('entidade_tipo', 'cliente')
    .eq('entidade_id', clienteId)
    .eq('tarefa_tipos.setor', 'societario')

  if (vinculosError) return { data: [], error: vinculosError.message }

  type TipoJoin = { id: string; nome: string; tipo_resposta: TipoResposta; etapas: string[] | null; meses_visiveis: number[] | null; ativo: boolean; responsavel_id: string | null }

  const aplicaveis = (vinculosRaw ?? [])
    .map(v => ({ createdAt: v.created_at as string, tipo: v.tarefa_tipos as unknown as TipoJoin }))
    .filter(v => v.tipo.ativo)
    .filter(v => tarefaEsperadaNoPeriodo({ mesesVisiveis: v.tipo.meses_visiveis, vinculoCreatedAt: v.createdAt }, mes, ano))

  if (aplicaveis.length === 0) return { data: [], error: null }

  const nomes = aplicaveis.map(v => v.tipo.nome)
  const { data: tarefasExistentes, error: tarefasError } = await supabase
    .from('tarefas').select('*')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('setor', 'societario')
    .in('tipo', nomes)

  if (tarefasError) return { data: [], error: tarefasError.message }

  const tarefaPorTipo = new Map((tarefasExistentes ?? []).map(t => [t.tipo as string, t as Tarefa]))

  const data: TarefaSocietarioAplicavel[] = aplicaveis.map(v => ({
    tarefaTipoId: v.tipo.id,
    nome: v.tipo.nome,
    tipoResposta: v.tipo.tipo_resposta,
    etapas: v.tipo.etapas,
    responsavelId: v.tipo.responsavel_id,
    tarefa: tarefaPorTipo.get(v.tipo.nome) ?? null,
  }))

  return { data, error: null }
}

async function buscarOuCriarTarefa(
  clienteId: string, tipo: string, mes: number, ano: number,
): Promise<{ id: string; error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { id: '', error: 'Sessão inválida.' }

  const { data: existente } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'societario')
    .maybeSingle()

  if (existente?.id) return { id: existente.id as string, error: null }

  const { data: nova, error } = await supabase
    .from('tarefas')
    .insert({ cliente_id: clienteId, usuario_id: user.id, mes, ano, tipo, setor: 'societario', concluida: false })
    .select('id')
    .single()

  if (error || !nova) return { id: '', error: error?.message ?? 'Não foi possível criar a tarefa.' }
  return { id: nova.id as string, error: null }
}

function revalidarFicha(clienteId: string) {
  revalidatePath(`/societario/clientes/${clienteId}`)
}

export async function toggleTarefaSocietario(
  clienteId: string, tipo: string, mes: number, ano: number, concluida: boolean, data?: string,
): Promise<{ error: string | null }> {
  if (!(await podeEditarTarefaTipoSocietario(tipo))) return { error: 'Sem permissão para editar essa tarefa.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { id: tarefaId, error } = await buscarOuCriarTarefa(clienteId, tipo, mes, ano)
  if (error) return { error }

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { error: updateError } = await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', tarefaId)
  if (updateError) return { error: updateError.message }

  revalidarFicha(clienteId)
  return { error: null }
}

export async function atualizarEtapaSocietario(
  clienteId: string, mes: number, ano: number, tipo: string, etapaNome: string, concluida: boolean, data?: string,
): Promise<{ error: string | null }> {
  if (!(await podeEditarTarefaTipoSocietario(tipo))) return { error: 'Sem permissão para editar essa tarefa.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { id: tarefaId, error } = await buscarOuCriarTarefa(clienteId, tipo, mes, ano)
  if (error) return { error }

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null

  const { data: etapaExistente } = await supabase
    .from('tarefa_etapas').select('id')
    .eq('tarefa_id', tarefaId).eq('nome', etapaNome)
    .maybeSingle()

  if (etapaExistente?.id) {
    await supabase.from('tarefa_etapas').update({ concluida, concluida_em }).eq('id', etapaExistente.id)
  } else {
    await supabase.from('tarefa_etapas').insert({ tarefa_id: tarefaId, nome: etapaNome, concluida, concluida_em })
  }

  const { data: tipoRow } = await supabase
    .from('tarefa_tipos').select('etapas')
    .eq('setor', 'societario').eq('nome', tipo)
    .maybeSingle()
  const etapasEsperadas: string[] = tipoRow?.etapas ?? []

  const { data: etapasAtuais } = await supabase
    .from('tarefa_etapas').select('nome, concluida')
    .eq('tarefa_id', tarefaId)

  const todasConcluidas = etapasEsperadas.length > 0 && etapasEsperadas.every(
    nome => ((etapasAtuais ?? []) as TarefaEtapa[]).find(e => e.nome === nome)?.concluida === true
  )

  await supabase.from('tarefas').update({
    concluida: todasConcluidas,
    concluida_em: todasConcluidas ? new Date().toISOString() : null,
  }).eq('id', tarefaId)

  revalidarFicha(clienteId)
  return { error: null }
}

export async function salvarRespostaTextoSocietario(
  clienteId: string, tipo: string, mes: number, ano: number, texto: string,
): Promise<{ error: string | null }> {
  if (!(await podeEditarTarefaTipoSocietario(tipo))) return { error: 'Sem permissão para editar essa tarefa.' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { id: tarefaId, error } = await buscarOuCriarTarefa(clienteId, tipo, mes, ano)
  if (error) return { error }

  const textoTrimado = texto.trim()
  const concluida = textoTrimado !== ''

  const { error: updateError } = await supabase.from('tarefas').update({
    resposta_texto: textoTrimado,
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }).eq('id', tarefaId)
  if (updateError) return { error: updateError.message }

  revalidarFicha(clienteId)
  return { error: null }
}
