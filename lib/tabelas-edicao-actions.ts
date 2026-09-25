// lib/tabelas-edicao-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeEditarLinhas } from './tabelas/permissoes'
import { podeAcessarPagina } from './route-permissions'
import { converterEntradaCelula, ehUuid } from './tabelas/editar-celula'
import type { SetorTabela } from './tabelas/montar-payload'
import type { OpcaoColuna, TipoColuna, ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; setor: SetorTabela }

// Sessão + tabela + permissão do setor dessa tabela. NUNCA confia em setor
// vindo do cliente: o setor é sempre lido da própria tabela.
async function contextoDaPlanilha(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, setor').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeEditarLinhas(profile, planilha.setor as SetorTabela) || !podeAcessarPagina(profile, planilha.setor as SetorTabela, 'tabelas')) return { error: 'Acesso negado.' }

  return { error: null, supabase, planilhaId: planilha.id as string, setor: planilha.setor as SetorTabela }
}

async function contextoDaLinha(linhaId: string): Promise<Contexto> {
  if (!ehUuid(linhaId)) return { error: 'Linha inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }
  const { data: linha } = await supabase.from('planilha_linhas').select('id, planilha_id').eq('id', linhaId).maybeSingle()
  if (!linha) return { error: 'Essa linha não existe mais (talvez outra pessoa a removeu). Recarregue a página.' }
  return contextoDaPlanilha(linha.planilha_id as string)
}

// O Router Cache do Next reaproveita payloads ao voltar no navegador; sem isso a grade
// mostraria valores antigos depois de uma edição.
function revalidarTabela(ctx: { setor: SetorTabela; planilhaId: string }) {
  revalidatePath(`/${ctx.setor}/tabelas/${ctx.planilhaId}`)
}

interface ColunaDB { id: string; planilha_id: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

// A coluna precisa pertencer à MESMA tabela do contexto (impede ids cruzados).
async function colunaDaTabela(supabase: Admin, colunaId: string, planilhaId: string): Promise<ColunaDB | null> {
  if (!ehUuid(colunaId)) return null
  const { data } = await supabase.from('planilha_colunas').select('id, planilha_id, tipo, opcoes').eq('id', colunaId).maybeSingle()
  if (!data || data.planilha_id !== planilhaId) return null
  return data as ColunaDB
}

export async function editarCelula(
  entrada: { linhaId: string; colunaId: string; valor: unknown },
): Promise<{ error: string | null; valor?: ValorCelula }> {
  const ctx = await contextoDaLinha(entrada?.linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const coluna = await colunaDaTabela(ctx.supabase, entrada.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }

  const convertido = converterEntradaCelula(coluna.tipo, entrada.valor, coluna.opcoes)
  if (!convertido.ok) return { error: convertido.erro }

  const { data, error } = await ctx.supabase.rpc('editar_celula_planilha', {
    p_linha: entrada.linhaId,
    p_coluna: coluna.id,
    p_valor: convertido.valor,
  })
  if (error) return { error: 'Não foi possível salvar a alteração.' }
  if (!data) return { error: 'Essa linha não existe mais. Recarregue a página.' }
  revalidarTabela(ctx)
  return { error: null, valor: convertido.valor }
}

export async function definirClienteDaLinha(
  entrada: { linhaId: string; colunaId: string; clienteId: string | null },
): Promise<{ error: string | null; nome?: string | null }> {
  const ctx = await contextoDaLinha(entrada?.linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const coluna = await colunaDaTabela(ctx.supabase, entrada.colunaId, ctx.planilhaId)
  if (!coluna || coluna.tipo !== 'cliente') return { error: 'Coluna inválida.' }

  // Se essa coluna é a chave da tabela (ex.: CNPJ), o texto importado é o identificador
  // usado na reimportação: só o vínculo muda, o texto da célula não é sobrescrito.
  const { data: planilha } = await ctx.supabase.from('planilhas').select('coluna_chave').eq('id', ctx.planilhaId).maybeSingle()
  const ehChave = planilha?.coluna_chave === coluna.id

  let nome: string | null = null
  if (entrada.clienteId !== null) {
    if (!ehUuid(entrada.clienteId)) return { error: 'Cliente inválido.' }
    const { data: cliente } = await ctx.supabase.from('clientes').select('nome').eq('id', entrada.clienteId).maybeSingle()
    if (!cliente) return { error: 'Cliente não encontrado.' }
    nome = ehChave ? null : (cliente.nome as string)
  }

  const { data, error } = await ctx.supabase.rpc('vincular_cliente_linha', {
    p_linha: entrada.linhaId,
    p_coluna: coluna.id,
    p_cliente: entrada.clienteId,
    p_nome: nome,
  })
  if (error) return { error: 'Não foi possível salvar o cliente.' }
  if (!data) return { error: 'Essa linha não existe mais. Recarregue a página.' }
  revalidarTabela(ctx)
  return { error: null, nome }
}

export async function adicionarLinha(planilhaId: string): Promise<{ error: string | null; id?: string }> {
  const ctx = await contextoDaPlanilha(planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('adicionar_linha_planilha', { p_planilha: ctx.planilhaId })
  if (error || !data) return { error: 'Não foi possível adicionar a linha.' }
  revalidarTabela(ctx)
  return { error: null, id: data as string }
}

export async function removerLinha(linhaId: string): Promise<{ error: string | null }> {
  const ctx = await contextoDaLinha(linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.from('planilha_linhas').delete().eq('id', linhaId).select('id')
  if (error) return { error: 'Não foi possível remover a linha.' }
  if (!data || data.length === 0) return { error: 'Essa linha já foi removida. Recarregue a página.' }
  revalidarTabela(ctx)
  return { error: null }
}
