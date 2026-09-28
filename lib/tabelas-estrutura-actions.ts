// lib/tabelas-estrutura-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { ehUuid, MAX_TEXTO_CELULA } from './tabelas/editar-celula'
import { prepararTrocaTipo, type LinhaValor } from './tabelas/trocar-tipo'
import type { SetorTabela } from './tabelas/montar-payload'
import type { OpcaoColuna, TipoColuna, ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; nome: string; setor: SetorTabela }
type ContextoColuna =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; nome: string; setor: SetorTabela; colunaId: string }

const TIPOS_VALIDOS: TipoColuna[] = ['texto', 'numero', 'data', 'opcoes', 'cliente']
const MAX_NOME = 120
const LOTE_LINHAS = 1000
const MAX_LINHAS_TROCA_TIPO = 5000

export interface ValorAlterado { id: string; de: ValorCelula; para: ValorCelula }

function validarNome(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  const t = nome.trim()
  return t === '' || t.length > MAX_NOME ? null : t
}

// Sessão + tabela + permissão de QUEM CONFIGURA o setor (não quem só edita
// linhas). NUNCA confia em setor vindo do cliente: lido sempre da tabela.
async function contextoConfig(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', planilha.setor as SetorTabela)) return { error: 'Acesso negado.' }

  return { error: null, supabase, planilhaId: planilha.id as string, nome: planilha.nome as string, setor: planilha.setor as SetorTabela }
}

async function contextoDaColuna(colunaId: string): Promise<ContextoColuna> {
  if (!ehUuid(colunaId)) return { error: 'Coluna inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }
  const { data: coluna } = await supabase.from('planilha_colunas').select('id, planilha_id').eq('id', colunaId).maybeSingle()
  if (!coluna) return { error: 'Coluna não encontrada.' }
  const ctx = await contextoConfig(coluna.planilha_id as string)
  if (ctx.error !== null) return ctx
  return { ...ctx, colunaId: coluna.id as string }
}

interface ColunaDB { id: string; planilha_id: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

// Busca tipo/opções da coluna pra checar a regra "cliente não troca de tipo".
// planilhaId aqui já veio de contextoDaColuna (derivado da própria coluna),
// então o `data.planilha_id !== planilhaId` é sempre verdadeiro por
// construção — a checagem fica como defesa em profundidade, barata e sem
// custo de manutenção.
async function colunaDaTabela(supabase: Admin, colunaId: string, planilhaId: string): Promise<ColunaDB | null> {
  const { data } = await supabase.from('planilha_colunas').select('id, planilha_id, tipo, opcoes').eq('id', colunaId).maybeSingle()
  if (!data || data.planilha_id !== planilhaId) return null
  return data as ColunaDB
}

function revalidarTabela(ctx: { setor: SetorTabela; planilhaId: string }) {
  revalidatePath(`/${ctx.setor}/tabelas/${ctx.planilhaId}`)
}

export async function adicionarColuna(
  entrada: { planilhaId: string; nome: string; tipo: TipoColuna; opcoes?: OpcaoColuna[] | null },
): Promise<{ error: string | null; id?: string }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }
  if (!TIPOS_VALIDOS.includes(entrada.tipo)) return { error: 'Tipo inválido.' }
  if (entrada.tipo === 'cliente') {
    const { data: existentes } = await ctx.supabase
      .from('planilha_colunas').select('id').eq('planilha_id', ctx.planilhaId).eq('tipo', 'cliente').limit(1)
    if (existentes && existentes.length > 0) return { error: 'Essa tabela já tem uma coluna do tipo Cliente.' }
  }
  const opcoes = entrada.tipo === 'opcoes' ? (entrada.opcoes ?? null) : null

  const { data, error } = await ctx.supabase.rpc('adicionar_coluna_planilha', {
    p_planilha: ctx.planilhaId,
    p_nome: nome,
    p_tipo: entrada.tipo,
    p_opcoes: opcoes,
  })
  if (error || !data) return { error: 'Não foi possível adicionar a coluna.' }
  revalidarTabela(ctx)
  return { error: null, id: data as string }
}

export async function renomearColuna(
  entrada: { colunaId: string; nome: string },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }

  const { error } = await ctx.supabase.rpc('renomear_coluna_planilha', { p_coluna: ctx.colunaId, p_nome: nome })
  if (error) return { error: 'Não foi possível renomear a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function moverColuna(
  entrada: { colunaId: string; direcao: 'cima' | 'baixo' },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (entrada.direcao !== 'cima' && entrada.direcao !== 'baixo') return { error: 'Direção inválida.' }

  const { error } = await ctx.supabase.rpc('mover_coluna_planilha', { p_coluna: ctx.colunaId, p_direcao: entrada.direcao })
  if (error) return { error: 'Não foi possível mover a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function preVisualizarExclusaoColuna(
  colunaId: string,
): Promise<{ error: string | null; total?: number; preenchidas?: number }> {
  const ctx = await contextoDaColuna(colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('contar_celulas_coluna', { p_coluna: ctx.colunaId })
  if (error || !data || data.length === 0) return { error: 'Não foi possível calcular o impacto.' }
  return { error: null, total: Number(data[0].total), preenchidas: Number(data[0].preenchidas) }
}

export async function excluirColuna(colunaId: string): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('excluir_coluna_planilha', { p_coluna: ctx.colunaId })
  if (error || !data) return { error: 'Não foi possível excluir a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function preVisualizarTrocaTipo(
  entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas?: OpcaoColuna[] | null },
): Promise<{ error: string | null; convertidas?: number; naoConvertidas?: number; valores?: ValorAlterado[] }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (!TIPOS_VALIDOS.includes(entrada.tipoNovo)) return { error: 'Tipo inválido.' }

  const coluna = await colunaDaTabela(ctx.supabase, ctx.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }
  if (coluna.tipo === 'cliente' || entrada.tipoNovo === 'cliente') {
    return { error: 'Coluna do tipo Cliente não pode trocar de tipo.' }
  }

  // Paginado: o PostgREST capa cada select em 1000 linhas por padrão, e o
  // limite de linhas por tabela é 5000 (Fase 1) — sem paginar, tabelas com
  // mais de 1000 linhas tinham a prévia errada e só um lote era convertido.
  const linhas: LinhaValor[] = []
  for (let offset = 0; offset < MAX_LINHAS_TROCA_TIPO; offset += LOTE_LINHAS) {
    const { data, error } = await ctx.supabase
      .from('planilha_linhas').select('id, dados')
      .eq('planilha_id', ctx.planilhaId)
      .order('id')
      .range(offset, offset + LOTE_LINHAS - 1)
    if (error) return { error: 'Não foi possível ler as linhas da tabela.' }
    const lote = data ?? []
    for (const l of lote) {
      linhas.push({ id: l.id as string, valorAtual: (l.dados as Record<string, ValorCelula>)[ctx.colunaId] ?? null })
    }
    if (lote.length < LOTE_LINHAS) break
  }

  const opcoesNovas = entrada.tipoNovo === 'opcoes' ? (entrada.opcoesNovas ?? null) : null
  const resultado = prepararTrocaTipo(linhas, entrada.tipoNovo, opcoesNovas)

  // Só manda adiante as linhas cujo valor realmente muda — payload menor e
  // a confirmação só regrava o que precisa mudar.
  const valorAtualPorId = new Map(linhas.map(l => [l.id, l.valorAtual]))
  const valores: ValorAlterado[] = resultado.valores
    .filter(v => valorAtualPorId.get(v.id) !== v.valor)
    .map(v => ({ id: v.id, de: valorAtualPorId.get(v.id) ?? null, para: v.valor }))

  return { error: null, convertidas: resultado.convertidas, naoConvertidas: resultado.naoConvertidas, valores }
}

export async function trocarTipoColuna(
  entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas: OpcaoColuna[] | null; valores: ValorAlterado[] },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (!TIPOS_VALIDOS.includes(entrada.tipoNovo)) return { error: 'Tipo inválido.' }

  const coluna = await colunaDaTabela(ctx.supabase, ctx.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }
  if (coluna.tipo === 'cliente' || entrada.tipoNovo === 'cliente') {
    return { error: 'Coluna do tipo Cliente não pode trocar de tipo.' }
  }
  const valorValido = (v: unknown) => v === null || typeof v === 'string' || typeof v === 'number'
  if (
    !Array.isArray(entrada.valores) ||
    !entrada.valores.every(v =>
      v && typeof v === 'object' && typeof (v as ValorAlterado).id === 'string' &&
      valorValido((v as ValorAlterado).de) && valorValido((v as ValorAlterado).para) &&
      (typeof (v as ValorAlterado).para !== 'string' || (v as ValorAlterado).para!.toString().length <= MAX_TEXTO_CELULA))
  ) {
    return { error: 'Dados de conversão inválidos.' }
  }

  const { error } = await ctx.supabase.rpc('trocar_tipo_coluna_planilha', {
    p_coluna: ctx.colunaId,
    p_tipo: entrada.tipoNovo,
    p_opcoes: entrada.tipoNovo === 'opcoes' ? entrada.opcoesNovas : null,
    p_valores: entrada.valores,
  })
  if (error) return { error: 'Não foi possível trocar o tipo da coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function renomearTabela(
  entrada: { planilhaId: string; nome: string },
): Promise<{ error: string | null }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }

  const { error } = await ctx.supabase.rpc('renomear_planilha', { p_planilha: ctx.planilhaId, p_nome: nome })
  if (error) return { error: 'Não foi possível renomear a tabela.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function excluirTabela(
  entrada: { planilhaId: string; nomeConfirmacao: string },
): Promise<{ error: string | null; setor?: SetorTabela }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  if (typeof entrada.nomeConfirmacao !== 'string' || entrada.nomeConfirmacao.trim() !== ctx.nome) {
    return { error: 'O nome digitado não confere com o nome da tabela.' }
  }

  const { error } = await ctx.supabase.from('planilhas').delete().eq('id', ctx.planilhaId)
  if (error) return { error: 'Não foi possível excluir a tabela.' }
  revalidatePath(`/${ctx.setor}/tabelas`)
  return { error: null, setor: ctx.setor }
}
