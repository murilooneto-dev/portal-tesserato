// lib/tabelas-reenvio-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { ehUuid } from './tabelas/editar-celula'
import { montarLinhas, LIMITE_LINHAS, type ColunaConfig, type SetorTabela } from './tabelas/montar-payload'
import {
  casarColunas, chavesDuplicadas, calcularDiffReenvio, montarAtualizacoes,
  type ColunaExistente, type LinhaExistente, type LinhaImportada, type ResolucaoConflito, type DiffReenvio,
} from './tabelas/reenvio'
import type { ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | {
      error: null
      supabase: Admin
      planilhaId: string
      setor: SetorTabela
      colunaChaveId: string
      colunas: ColunaExistente[]
      usuarioId: string
      usuarioNome: string
    }

const LOTE_LINHAS = 1000

// Sessão + tabela + permissão de quem configura o setor + coluna-chave
// definida (sem ela não há como casar linha nenhuma). Setor sempre lido do
// banco, nunca do cliente.
async function contexto(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, setor, coluna_chave').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso, nome').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', planilha.setor as SetorTabela)) return { error: 'Acesso negado.' }

  if (!planilha.coluna_chave) {
    return { error: 'Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar.' }
  }

  const { data: colunasRaw } = await supabase
    .from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', planilhaId)
  const colunas = (colunasRaw ?? []) as ColunaExistente[]

  return {
    error: null,
    supabase,
    planilhaId: planilha.id as string,
    setor: planilha.setor as SetorTabela,
    colunaChaveId: planilha.coluna_chave as string,
    colunas,
    usuarioId: user.id,
    usuarioNome: (profile?.nome as string | undefined) ?? 'Desconhecido',
  }
}

async function lerLinhasExistentes(supabase: Admin, planilhaId: string): Promise<LinhaExistente[]> {
  const linhas: LinhaExistente[] = []
  for (let offset = 0; offset < LIMITE_LINHAS; offset += LOTE_LINHAS) {
    const { data } = await supabase
      .from('planilha_linhas').select('id, dados')
      .eq('planilha_id', planilhaId)
      .order('id')
      .range(offset, offset + LOTE_LINHAS - 1)
    const lote = data ?? []
    for (const l of lote) linhas.push({ id: l.id as string, dados: l.dados as Record<string, ValorCelula> })
    if (lote.length < LOTE_LINHAS) break
  }
  return linhas
}

export interface EntradaArquivo {
  planilhaId: string
  cabecalhos: string[]
  linhas: ValorCelula[][]
  clientePorLinha: (string | null)[]
}

function validarEntrada(e: unknown): e is EntradaArquivo {
  if (typeof e !== 'object' || e === null) return false
  const x = e as Record<string, unknown>
  return (
    typeof x.planilhaId === 'string' &&
    Array.isArray(x.cabecalhos) && x.cabecalhos.every(c => typeof c === 'string') &&
    Array.isArray(x.linhas) &&
    Array.isArray(x.clientePorLinha)
  )
}

// Recalcula tudo a partir do arquivo cru: casamento de coluna, conversão de
// valor por tipo, e o diff contra as linhas atuais do banco. Chamada tanto
// pela prévia quanto pela confirmação — a confirmação NUNCA reaproveita um
// diff calculado antes, sempre lê o banco de novo dentro desta mesma
// chamada.
async function recalcularDiff(entrada: EntradaArquivo): Promise<
  | { error: string }
  | { error: null; ctx: Extract<Contexto, { error: null }>; diff: DiffReenvio; naoConvertidas: number; naoReconhecidas: string[] }
> {
  const ctx = await contexto(entrada.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (entrada.linhas.length === 0) return { error: 'Não há linhas de dados no arquivo.' }
  if (entrada.linhas.length > LIMITE_LINHAS) return { error: `O limite é de ${LIMITE_LINHAS.toLocaleString('pt-BR')} linhas por arquivo.` }

  const { casadas, naoReconhecidas } = casarColunas(entrada.cabecalhos, ctx.colunas)
  if (!casadas.some(c => c.id === ctx.colunaChaveId)) {
    return { error: 'O arquivo não tem uma coluna com o mesmo nome da coluna-chave da tabela.' }
  }

  const config: ColunaConfig[] = casadas.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, opcoes: c.opcoes, indiceOrigem: c.indiceOrigem }))
  const { linhas: convertidas, naoConvertidas } = montarLinhas(entrada.linhas, config, entrada.clientePorLinha)

  const linhasImportadas: LinhaImportada[] = convertidas.map((l, i) => {
    const dados: Record<string, ValorCelula> = {}
    casadas.forEach((c, j) => { dados[c.id] = l.v[j] })
    const chaveValor = String(dados[ctx.colunaChaveId] ?? '').trim()
    return { indiceOrigem: i, chaveValor, dados }
  })

  const duplicadas = chavesDuplicadas(linhasImportadas.map(l => l.chaveValor || null))
  if (duplicadas.length > 0) {
    return {
      error: `O arquivo tem valores repetidos na coluna-chave: ${duplicadas.slice(0, 5).join(', ')}${duplicadas.length > 5 ? '…' : ''}. Corrija o arquivo antes de reenviar.`,
    }
  }

  const linhasExistentes = await lerLinhasExistentes(ctx.supabase, ctx.planilhaId)
  const diff = calcularDiffReenvio(linhasImportadas, linhasExistentes, ctx.colunaChaveId)

  const totalFinal = linhasExistentes.length + diff.novas.length
  if (totalFinal > LIMITE_LINHAS) {
    return { error: `Esse reenvio deixaria a tabela com ${totalFinal.toLocaleString('pt-BR')} linhas; o limite é ${LIMITE_LINHAS.toLocaleString('pt-BR')}.` }
  }

  return { error: null, ctx, diff, naoConvertidas, naoReconhecidas: naoReconhecidas.map(n => n.nome) }
}

export interface PreviaReenvio {
  novas: number
  semConflito: number
  comConflito: { linhaId: string; celulas: { coluna: string; de: ValorCelula; para: ValorCelula }[] }[]
  ausentes: number
  naoConvertidas: number
  naoReconhecidas: string[]
}

export async function preVisualizarReenvio(entrada: unknown): Promise<{ error: string | null; previa?: PreviaReenvio }> {
  if (!validarEntrada(entrada)) return { error: 'Dados inválidos.' }
  const r = await recalcularDiff(entrada)
  if (r.error !== null) return { error: r.error }

  const semConflito = r.diff.atualizar.reduce((n, l) => n + l.semConflito.length, 0)
  return {
    error: null,
    previa: {
      novas: r.diff.novas.length,
      semConflito,
      comConflito: r.diff.atualizar
        .filter(l => l.comConflito.length > 0)
        .map(l => ({ linhaId: l.linhaId, celulas: l.comConflito })),
      ausentes: r.diff.ausentes.length,
      naoConvertidas: r.naoConvertidas,
      naoReconhecidas: r.naoReconhecidas,
    },
  }
}

export async function aplicarReenvio(
  entrada: unknown,
  resolucoes: Record<string, ResolucaoConflito>,
): Promise<{ error: string | null }> {
  if (!validarEntrada(entrada)) return { error: 'Dados inválidos.' }
  if (typeof resolucoes !== 'object' || resolucoes === null) return { error: 'Resoluções inválidas.' }

  const r = await recalcularDiff(entrada)
  if (r.error !== null) return { error: r.error }
  const { ctx, diff } = r

  const linhasNovas = diff.novas.map(n => ({ dados: n.dados, clienteId: entrada.clientePorLinha[n.indiceOrigem] ?? null }))
  const atualizacoes = montarAtualizacoes(diff.atualizar, resolucoes)

  const comConflitoPlanilha = diff.atualizar.filter(l => l.comConflito.length > 0 && resolucoes[l.linhaId] === 'planilha').length
  const comConflitoSistema = diff.atualizar.filter(l => l.comConflito.length > 0).length - comConflitoPlanilha

  const { error } = await ctx.supabase.rpc('aplicar_reenvio_planilha', {
    p_planilha: ctx.planilhaId,
    p_linhas_novas: linhasNovas,
    p_atualizacoes: atualizacoes,
    p_usuario_id: ctx.usuarioId,
    p_usuario_nome: ctx.usuarioNome,
    p_resumo: {
      novas: diff.novas.length,
      semConflito: diff.atualizar.reduce((n, l) => n + l.semConflito.length, 0),
      comConflitoSistema,
      comConflitoPlanilha,
      ausentes: diff.ausentes.length,
    },
  })
  if (error) return { error: 'Não foi possível aplicar o reenvio.' }
  revalidatePath(`/${ctx.setor}/tabelas/${ctx.planilhaId}`)
  return { error: null }
}
