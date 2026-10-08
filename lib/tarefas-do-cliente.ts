import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from './types'

// Nomes que estavam em tarefas_personalizadas do cliente e saíram dela, e que
// também não continuam aplicáveis por outra via (vínculo de atividade/regime,
// ver calcularTarefasEsperadas) — só esses perdem o histórico. Escopo é sempre
// um cliente: o catálogo (tarefa_tipos) e os outros clientes não são tocados.
export function tarefasRemovidasDoCliente(
  personalizadasAntes: string[] | null | undefined,
  esperadasDepois: string[],
): string[] {
  const continuam = new Set(esperadasDepois)
  return Array.from(new Set(personalizadasAntes ?? [])).filter(t => !continuam.has(t))
}

// `tarefas.tipo` é texto sem FK: sem isto, recriar o mesmo nome no cliente
// religa as linhas antigas (concluída, respostas, datas) por casar o nome.
// tarefa_etapas e tarefa_arquivos saem junto (on delete cascade).
export async function apagarTarefasDoCliente(
  supabase: SupabaseClient,
  clienteId: string,
  setor: UserSetor,
  tipos: string[],
): Promise<{ error?: string }> {
  if (tipos.length === 0) return {}
  const { error } = await supabase
    .from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', setor).in('tipo', tipos)
  return error ? { error: error.message } : {}
}

interface TipoDoCatalogo { id: string; nome: string; padrao: boolean; vigente_ate: string | null }

// Dos tipos informados, os ids que podem sair do catálogo: criados no cadastro
// de um cliente (padrao=false), sem encerramento configurado, sem vínculo de
// atividade e que não sobraram em tarefas_personalizadas de nenhum cliente.
export function tiposSemUso(
  tipos: TipoDoCatalogo[],
  nomesEmUso: string[],
  idsComVinculo: string[],
): string[] {
  const emUso = new Set(nomesEmUso)
  const comVinculo = new Set(idsComVinculo)
  return tipos
    .filter(t => !t.padrao && !t.vigente_ate && !emUso.has(t.nome) && !comVinculo.has(t.id))
    .map(t => t.id)
}

const TABELA_CLIENTES_DO_SETOR: Partial<Record<UserSetor, string>> = {
  fiscal: 'clientes_fiscal',
  contabil: 'clientes_contabil',
  pessoal: 'clientes_pessoal',
}

// Remover a tarefa do último cliente que a usava deixava o tipo órfão no
// catálogo: ao digitar o mesmo nome meses depois, o cadastro achava o tipo
// antigo e o reaproveitava (formato e criado_em antigos, então a tarefa
// "nova" aparecia desde o mês da primeira criação). Tipo que ninguém mais usa
// sai do catálogo aqui; recriar o nome passa de novo pelo NovoTipoTarefaModal
// e nasce com a data de hoje. Chamar depois de gravar o cliente.
export async function apagarTiposSemUso(
  supabase: SupabaseClient,
  setor: UserSetor,
  nomes: string[],
): Promise<{ error?: string }> {
  const tabela = TABELA_CLIENTES_DO_SETOR[setor]
  if (!tabela || nomes.length === 0) return {}

  const { data: tipos, error: errTipos } = await supabase
    .from('tarefa_tipos').select('id, nome, padrao, vigente_ate').eq('setor', setor).in('nome', nomes)
  if (errTipos) return { error: errTipos.message }
  if (!tipos || tipos.length === 0) return {}

  const [{ data: clientes, error: errClientes }, { data: vinculos, error: errVinculos }] = await Promise.all([
    supabase.from(tabela).select('tarefas_personalizadas').overlaps('tarefas_personalizadas', nomes),
    supabase.from('tarefa_tipo_vinculos').select('tarefa_tipo_id').in('tarefa_tipo_id', tipos.map(t => t.id as string)),
  ])
  // Sem conseguir conferir o uso, não apaga nada.
  if (errClientes) return { error: errClientes.message }
  if (errVinculos) return { error: errVinculos.message }

  const ids = tiposSemUso(
    tipos as TipoDoCatalogo[],
    (clientes ?? []).flatMap(c => (c.tarefas_personalizadas as string[] | null) ?? []),
    (vinculos ?? []).map(v => v.tarefa_tipo_id as string),
  )
  if (ids.length === 0) return {}
  const { error } = await supabase.from('tarefa_tipos').delete().in('id', ids)
  return error ? { error: error.message } : {}
}
