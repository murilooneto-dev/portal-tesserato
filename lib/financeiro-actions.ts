'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, createClient, createAdminClient } from './supabase/server'
import { validarNomeEntidade, normalizarNome } from './config-entidades'
import { ehConta, type ResultadoFormaPagamento } from './financeiro-movimentos'
import { hojeISO } from './mes-atual'
import { separarEmails } from './financeiro-aviso-vencimento'
import { enviarAvisoVencimento } from './financeiro-aviso-vencimento-envio'
import type { FinanceiroNatureza, FinanceiroFormaPagamento, FinanceiroTipo,FinanceiroCentroCusto } from './types'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

// Usada só nas ações de CRIAR tipo de entrada/centro de custo — permite que
// qualquer usuário do setor financeiro cadastre um item novo direto do modal
// de lançamento, sem precisar de um admin. Renomear/ativar/excluir continuam
// exigindo admin (exigirAdmin), gerenciados só em Configurações. Conta a
// pagar (a saída) é sempre criada por admin, em Contas a Pagar.
async function exigirFinanceiroOuAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role, setores').eq('id', user.id).single()
  const autorizado = callerProfile?.role === 'admin' || (callerProfile?.setores ?? []).includes('financeiro')
  if (!autorizado) return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

// ---------- financeiro_tipos ----------

export async function listarFinanceiroTipos(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroTipo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('financeiro_tipos')
    .select('id, natureza, nome, ativo, forma_pagamento, valor_padrao, dia_vencimento, mes_inicio, qtd_meses, indeterminado')
    .eq('natureza', natureza)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as FinanceiroTipo[], error: null }
}

/**
 * Contas que se repetem (Recorrente e Prazo determinado), para a janela
 * Gerenciar contas de Contas a Pagar. Conta encerrada e nome de pagamento
 * antigo (forma Avulso) ficam de fora.
 */
export async function listarContasRecorrentes(): Promise<{ data: FinanceiroTipo[]; error: string | null }> {
  const { data, error } = await listarFinanceiroTipos('saida')
  return { data: data.filter(t => t.forma_pagamento === 'recorrente' || t.forma_pagamento === 'prazo'), error }
}

export interface FormaPagamentoInput {
  tipoId: string
  forma: FinanceiroFormaPagamento
  valor: number | null
  dia: number | null
  /** YYYY-MM-01 */
  mesInicio: string | null
  qtdMeses: number | null
  /** Só Recorrente: mantém sempre 48 meses à frente, sem parar em dezembro. */
  indeterminado?: boolean
}

// Parâmetros da função do banco (migrations 065 e 068). Com p_simular só devolve as
// contagens do que mudaria; sem ele grava de verdade, numa transação só.
// A função é chamada SEMPRE com o cliente da sessão (createClient), nunca com
// o de serviço que exigirAdmin devolve: ela confere is_admin() pelo usuário
// logado, e com a chave de serviço não há usuário (daria "Acesso negado.").
function parametrosForma(input: FormaPagamentoInput, simular: boolean) {
  return {
    p_tipo_id: input.tipoId,
    p_forma: input.forma,
    p_valor: input.valor,
    p_dia: input.dia,
    p_mes_inicio: input.mesInicio,
    p_qtd_meses: input.qtdMeses,
    p_simular: simular,
    p_indeterminado: input.forma === 'recorrente' && input.indeterminado === true,
  }
}

/** Simula a troca de forma de pagamento da conta: não grava nada. */
export async function previaFormaPagamentoTipo(
  input: FormaPagamentoInput,
): Promise<{ data: ResultadoFormaPagamento | null; error: string | null }> {
  const { error } = await exigirAdmin()
  if (error) return { data: null, error }

  const sessao = await createClient()
  const { data, error: rpcError } = await sessao.rpc('financeiro_definir_forma_pagamento', parametrosForma(input, true))
  // A mensagem do `raise exception` do banco já vem em português.
  if (rpcError) return { data: null, error: rpcError.message }
  return { data: data as ResultadoFormaPagamento, error: null }
}

/**
 * Grava a forma de pagamento da conta e cria/ajusta/apaga as contas não pagas.
 * Com forma 'avulso' a conta é encerrada: as não pagas saem, as pagas ficam.
 */
export async function definirFormaPagamentoTipo(
  input: FormaPagamentoInput,
): Promise<{ data: ResultadoFormaPagamento | null; error: string | null }> {
  const { error } = await exigirAdmin()
  if (error) return { data: null, error }

  const sessao = await createClient()
  const { data, error: rpcError } = await sessao.rpc('financeiro_definir_forma_pagamento', parametrosForma(input, false))
  if (rpcError) return { data: null, error: rpcError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  revalidatePath('/financeiro/contas-a-pagar')
  revalidatePath('/financeiro/pagamentos')
  return { data: data as ResultadoFormaPagamento, error: null }
}

/**
 * Botão "Nova conta" de Contas a Pagar, formas Recorrente e Prazo determinado:
 * cria o cadastro da conta (linha de financeiro_tipos) e já define a forma de
 * pagamento dele, que gera as contas. Se a forma for recusada pelo banco, o
 * cadastro recém-criado é apagado: não sobra conta pela metade.
 *
 * Nome igual ao de uma conta encerrada ou de um pagamento antigo (forma
 * Avulso) reaproveita aquele cadastro: o histórico continua sob o mesmo nome.
 */
export async function criarContaAPagar(input: {
  nome: string
  forma: 'recorrente' | 'prazo'
  valor: number
  dia: number
  /** YYYY-MM-01 */
  mesInicio: string
  qtdMeses: number | null
  indeterminado?: boolean
}): Promise<{ data: ResultadoFormaPagamento | null; error: string | null }> {
  const erroNome = validarNomeEntidade(input.nome)
  if (erroNome) return { data: null, error: erroNome }

  const { error } = await exigirAdmin()
  if (error) return { data: null, error }

  const sessao = await createClient()
  const nomeNormalizado = normalizarNome(input.nome)
  const { data: existentes } = await sessao.from('financeiro_tipos')
    .select('id, nome, forma_pagamento, ativo').eq('natureza', 'saida')
  const igual = (existentes ?? []).find(e => normalizarNome(e.nome) === nomeNormalizado)
  if (igual && igual.forma_pagamento !== 'avulso') {
    return { data: null, error: 'Já existe uma conta com esse nome. Para mudar o valor, o dia ou o prazo dela, use Gerenciar contas.' }
  }

  let tipoId: string
  if (igual) {
    tipoId = igual.id
  } else {
    const { data: tipo, error: erroTipo } = await sessao.from('financeiro_tipos')
      .insert({ natureza: 'saida', nome: input.nome.trim() }).select('id').single()
    if (erroTipo || !tipo) {
      if (erroTipo?.code === '23505') return { data: null, error: 'Já existe uma conta com esse nome.' }
      return { data: null, error: erroTipo?.message ?? 'Falha ao criar a conta.' }
    }
    tipoId = tipo.id
  }

  const { data, error: rpcError } = await sessao.rpc('financeiro_definir_forma_pagamento', parametrosForma({
    tipoId,
    forma: input.forma,
    valor: input.valor,
    dia: input.dia,
    mesInicio: input.mesInicio,
    qtdMeses: input.forma === 'prazo' ? input.qtdMeses : null,
    indeterminado: input.indeterminado,
  }, false))
  if (rpcError) {
    // Só o cadastro criado agora é apagado; o reaproveitado tem histórico.
    if (!igual) await sessao.from('financeiro_tipos').delete().eq('id', tipoId)
    return { data: null, error: rpcError.message }
  }
  // Cadastro antigo desativado volta a valer: a rotina diária só renova os ativos.
  if (igual && !igual.ativo) await sessao.from('financeiro_tipos').update({ ativo: true }).eq('id', tipoId)

  revalidatePath('/financeiro/contas-a-pagar')
  return { data: data as ResultadoFormaPagamento, error: null }
}

/**
 * Botão "Nova conta" de Contas a Pagar, forma Única: uma conta só, com a
 * descrição digitada e sem cadastro por trás (tipo_id nulo). Nasce a pagar; a
 * `competencia` (mês do vencimento) é o que a marca como conta.
 */
export async function criarContaUnica(input: {
  descricao: string
  valor: number
  /** YYYY-MM-DD */
  vencimento: string
  centroCustoId: string | null
  observacao: string | null
}): Promise<{ error: string | null }> {
  const descricao = input.descricao.trim()
  if (!descricao) return { error: 'Informe a descrição da conta.' }
  if (descricao.length > 120) return { error: 'A descrição deve ter no máximo 120 caracteres.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vencimento)) return { error: 'Informe o vencimento.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor maior que zero.' }

  const { error } = await exigirAdmin()
  if (error) return { error }

  const sessao = await createClient()
  const { data: { user } } = await sessao.auth.getUser()
  const { error: insertError } = await sessao.from('financeiro_movimentos').insert({
    natureza: 'saida',
    tipo_id: null,
    descricao,
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data: input.vencimento,
    competencia: `${input.vencimento.slice(0, 7)}-01`,
    observacao: input.observacao,
    criado_por: user?.id ?? null,
    pago: false,
  })
  if (insertError) return { error: insertError.message }

  revalidatePath('/financeiro/contas-a-pagar')
  return { error: null }
}

/** Renomeia uma conta Recorrente ou de Prazo (Gerenciar contas). O nome novo vale também no histórico. */
export async function renomearContaAPagar(id: string, nome: string): Promise<{ error: string | null }> {
  const resultado = await renomearFinanceiroTipo(id, nome)
  if (resultado.error) {
    return { error: resultado.error.replace('um tipo', 'uma conta ou um pagamento antigo') }
  }
  revalidatePath('/financeiro/contas-a-pagar')
  revalidatePath('/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}

export async function criarFinanceiroTipo(
  natureza: FinanceiroNatureza,
  nome: string,
): Promise<{ error: string | null }> {
  // Saída não tem mais tipo: a despesa nasce em Contas a Pagar (Nova conta).
  if (natureza !== 'entrada') return { error: 'Tipo de saída não existe mais. Crie a conta em Contas a Pagar.' }

  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirFinanceiroOuAdmin()
  if (error || !supabase) return { error }

  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from('financeiro_tipos').select('nome').eq('natureza', natureza)
  if ((existentes ?? []).some(e => normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um tipo equivalente a esse nome.' }
  }

  const { error: insertError } = await supabase.from('financeiro_tipos').insert({ natureza, nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um tipo com esse nome.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function renomearFinanceiroTipo(id: string, nome: string): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: atual } = await supabase.from('financeiro_tipos').select('natureza').eq('id', id).single()
  if (atual) {
    const nomeNormalizado = normalizarNome(nome)
    const { data: existentes } = await supabase.from('financeiro_tipos').select('id, nome').eq('natureza', atual.natureza)
    if ((existentes ?? []).some(e => e.id !== id && normalizarNome(e.nome) === nomeNormalizado)) {
      return { error: 'Já existe um tipo equivalente a esse nome.' }
    }
  }

  const { error: updateError } = await supabase.from('financeiro_tipos').update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um tipo com esse nome.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function alternarAtivoFinanceiroTipo(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('financeiro_tipos').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function excluirFinanceiroTipo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { count } = await supabase.from('financeiro_movimentos').select('id', { count: 'exact', head: true }).eq('tipo_id', id)
  if ((count ?? 0) > 0) {
    return { error: `Não é possível excluir: em uso por ${count} movimento(s). Desative em vez de excluir.` }
  }

  const { error: deleteError } = await supabase.from('financeiro_tipos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

// ---------- financeiro_centros_custo ----------

export async function listarFinanceiroCentrosCusto(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroCentroCusto[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('financeiro_centros_custo')
    .select('id, nome, ativo, natureza')
    .or(`natureza.eq.${natureza},natureza.is.null`)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as FinanceiroCentroCusto[], error: null }
}

export async function criarFinanceiroCentroCusto(
  natureza: FinanceiroNatureza,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirFinanceiroOuAdmin()
  if (error || !supabase) return { error }

  const nomeNormalizado = normalizarNome(nome)
  const { data: existentes } = await supabase.from('financeiro_centros_custo').select('nome').or(`natureza.eq.${natureza},natureza.is.null`)
  if ((existentes ?? []).some(e => normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um centro de custo equivalente a esse nome.' }
  }

  const { error: insertError } = await supabase.from('financeiro_centros_custo').insert({ natureza, nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um centro de custo com esse nome.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function renomearFinanceiroCentroCusto(id: string, nome: string): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: atual } = await supabase.from('financeiro_centros_custo').select('natureza').eq('id', id).single()
  const nomeNormalizado = normalizarNome(nome)
  const filtroNatureza = atual?.natureza ? `natureza.eq.${atual.natureza},natureza.is.null` : 'natureza.is.null'
  const { data: existentes } = await supabase.from('financeiro_centros_custo').select('id, nome').or(filtroNatureza)
  if ((existentes ?? []).some(e => e.id !== id && normalizarNome(e.nome) === nomeNormalizado)) {
    return { error: 'Já existe um centro de custo equivalente a esse nome.' }
  }

  const { error: updateError } = await supabase.from('financeiro_centros_custo').update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um centro de custo com esse nome.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function alternarAtivoFinanceiroCentroCusto(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('financeiro_centros_custo').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

export async function excluirFinanceiroCentroCusto(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { count } = await supabase.from('financeiro_movimentos').select('id', { count: 'exact', head: true }).eq('centro_custo_id', id)
  if ((count ?? 0) > 0) {
    return { error: `Não é possível excluir: em uso por ${count} movimento(s). Desative em vez de excluir.` }
  }

  const { error: deleteError } = await supabase.from('financeiro_centros_custo').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { error: null }
}

// ---------- aviso de vencimento (financeiro_config) ----------

export async function lerEmailAvisoVencimento(): Promise<{ email: string; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { email: '', error }

  const { data, error: queryError } = await supabase
    .from('financeiro_config').select('email_aviso_vencimento').eq('id', 1).maybeSingle()
  if (queryError) return { email: '', error: queryError.message }
  return { email: data?.email_aviso_vencimento ?? '', error: null }
}

/** Grava o(s) destinatário(s) do aviso. Vazio desliga o aviso. */
export async function salvarEmailAvisoVencimento(texto: string): Promise<{ email: string; error: string | null }> {
  const { validos, invalidos } = separarEmails(texto)
  if (invalidos.length > 0) return { email: texto, error: `E-mail inválido: ${invalidos.join(', ')}` }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { email: texto, error }

  const email = validos.join(', ')
  const { error: upsertError } = await supabase
    .from('financeiro_config').upsert({ id: 1, email_aviso_vencimento: email || null })
  if (upsertError) return { email: texto, error: upsertError.message }

  revalidatePath('/admin/configuracoes/financeiro')
  return { email, error: null }
}

/**
 * Manda agora, para o e-mail já salvo, o aviso das contas a pagar que vencem
 * amanhã. Não conta como o envio do dia.
 */
export async function enviarTesteAvisoVencimento(): Promise<{ mensagem: string | null; error: string | null }> {
  const { error } = await exigirAdmin()
  if (error) return { mensagem: null, error }

  try {
    const resultado = await enviarAvisoVencimento(createAdminClient(), { teste: true })
    if (resultado.status === 'sem_destinatario') return { mensagem: null, error: 'Salve um e-mail antes de enviar o teste.' }
    if (resultado.status !== 'enviado') return { mensagem: null, error: 'O teste não foi enviado.' }
    const lista = resultado.quantidade === 0
      ? 'sem contas vencendo amanhã'
      : resultado.quantidade === 1 ? 'com 1 conta' : `com ${resultado.quantidade} contas`
    return { mensagem: `Teste enviado para ${resultado.destinatarios.join(', ')} (${lista}).`, error: null }
  } catch (e) {
    return { mensagem: null, error: e instanceof Error ? e.message : 'Falha ao enviar o e-mail.' }
  }
}

// ---------- financeiro_movimentos ----------

// Leitura/escrita de movimentos não passa por exigirAdmin(): qualquer usuário
// com 'financeiro' em profiles.setores pode lançar (RLS da migration 042 já
// restringe isso no banco). Só precisamos confirmar que há um usuário logado.

export async function listarFinanceiroTiposAtivos(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroTipo[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('financeiro_tipos')
    .select('id, natureza, nome, ativo')
    .eq('natureza', natureza)
    .eq('ativo', true)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as FinanceiroTipo[], error: null }
}

export async function listarFinanceiroCentrosCustoAtivos(
  natureza: FinanceiroNatureza,
): Promise<{ data: FinanceiroCentroCusto[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('financeiro_centros_custo')
    .select('id, nome, ativo, natureza')
    .eq('ativo', true)
    .or(`natureza.eq.${natureza},natureza.is.null`)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as FinanceiroCentroCusto[], error: null }
}

export async function criarMovimento(input: {
  natureza: FinanceiroNatureza
  tipoId: string
  centroCustoId: string | null
  valor: number
  data: string
  observacao: string | null
}): Promise<{ id: string } | { error: string }> {
  // Só recebimento é lançado direto. Pagamento nasce como conta em Contas a
  // Pagar e chega a Pagamentos quando é pago.
  if (input.natureza !== 'entrada') return { error: 'Pagamento é criado em Contas a Pagar (Nova conta).' }
  if (!input.tipoId) return { error: 'Selecione o tipo.' }
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  // Recebimento já nasce confirmado (pago_em é preenchido pelo banco com a
  // própria data).
  const { data: novo, error } = await supabase.from('financeiro_movimentos').insert({
    natureza: input.natureza,
    tipo_id: input.tipoId,
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data: input.data,
    observacao: input.observacao,
    criado_por: user.id,
    pago: true,
  }).select('id').single()

  if (error || !novo) return { error: error?.message ?? 'Falha ao criar movimento.' }

  revalidatePath(input.natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { id: novo.id }
}

export async function atualizarMovimento(input: {
  id: string
  natureza: FinanceiroNatureza
  /** Só recebimento troca de tipo. Em pagamento o nome da conta não muda por aqui. */
  tipoId: string | null
  centroCustoId: string | null
  valor: number
  data: string
  observacao: string | null
  /** Só conta Única (sem cadastro): o nome dela é esta descrição. */
  descricao?: string
  /**
   * Só conta já paga: corrige o dia do pagamento (a `data` dela é o
   * vencimento). Em lançamento avulso é ignorado: lá o dia do pagamento é a
   * própria data.
   */
  pagoEm?: string
}): Promise<{ error: string | null }> {
  const ehEntrada = input.natureza === 'entrada'
  if (ehEntrada && !input.tipoId) return { error: 'Selecione o tipo.' }
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }
  if (input.descricao !== undefined && !input.descricao.trim()) return { error: 'Informe a descrição da conta.' }
  if (input.pagoEm !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pagoEm)) return { error: 'Informe o dia do pagamento.' }
    if (input.pagoEm > hojeISO()) return { error: 'O dia do pagamento não pode ser depois de hoje.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  // A hora guardada é a do clique em Pagar: com outro dia ela deixa de valer.
  // Mesmo dia: não toca em nada, a hora continua.
  let pagamento: { pago_em: string; pago_em_hora: null } | null = null
  if (input.pagoEm !== undefined) {
    const { data: atual, error: erroAtual } = await supabase.from('financeiro_movimentos')
      .select('pago, pago_em, recorrencia_id, competencia').eq('id', input.id).maybeSingle()
    if (erroAtual) return { error: erroAtual.message }
    if (atual?.pago && ehConta(atual) && atual.pago_em !== input.pagoEm) {
      pagamento = { pago_em: input.pagoEm, pago_em_hora: null }
    }
  }

  const campos = {
    ...(ehEntrada ? { tipo_id: input.tipoId } : null),
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data: input.data,
    observacao: input.observacao,
    ...pagamento,
  }

  const { error } = await supabase.from('financeiro_movimentos').update(campos).eq('id', input.id).eq('natureza', input.natureza)
  if (error) return { error: error.message }

  // A descrição só é o nome na conta Única; em conta com cadastro ela não existe.
  if (!ehEntrada && input.descricao !== undefined) {
    const { error: erroDescricao } = await supabase.from('financeiro_movimentos')
      .update({ descricao: input.descricao.trim() }).eq('id', input.id).is('tipo_id', null)
    if (erroDescricao) return { error: erroDescricao.message }
  }

  revalidatePath(input.natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}

/**
 * Confirma que um pagamento previsto foi feito (ou desfaz a confirmação).
 * Só pagamentos: recebimento não tem esse controle.
 */
export async function definirPagamentoConfirmado(id: string, pago: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  // `.eq('pago', !pago)`: só muda quem está no estado oposto. Um segundo clique
  // (ou outra aba) não acha linha e não troca a hora do primeiro pagamento.
  let consulta = supabase.from('financeiro_movimentos')
    .update(pago
      ? { pago: true, pago_em: hojeISO(), pago_em_hora: new Date().toISOString() }
      : { pago: false, pago_em: null, pago_em_hora: null })
    .eq('id', id)
    .eq('natureza', 'saida')
    .eq('pago', !pago)
  // Desfazer só vale para conta a pagar; lançamento avulso nasce pago e fica assim.
  if (!pago) consulta = consulta.or('recorrencia_id.not.is.null,competencia.not.is.null')
  const { data: alterados, error } = await consulta.select('id')

  if (error) return { error: error.message }
  if (!alterados || alterados.length === 0) {
    return { error: pago ? 'Esta conta já foi paga ou não existe mais.' : 'Só dá para desfazer o pagamento de uma conta a pagar.' }
  }

  revalidatePath('/financeiro/pagamentos')
  revalidatePath('/financeiro/contas-a-pagar')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}

/**
 * Edita uma conta ainda não paga (valor, data, centro de custo, observação).
 * O nome só muda aqui na conta Única, pela descrição.
 */
export async function atualizarConta(input: {
  id: string
  centroCustoId: string | null
  valor: number
  data: string
  observacao: string | null
  /** Só conta Única (sem cadastro): o nome dela é esta descrição. */
  descricao?: string
}): Promise<{ error: string | null }> {
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }
  if (input.descricao !== undefined && !input.descricao.trim()) return { error: 'Informe a descrição da conta.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const { data: alterados, error } = await supabase.from('financeiro_movimentos')
    .update({ centro_custo_id: input.centroCustoId, valor: input.valor, data: input.data, observacao: input.observacao })
    .eq('id', input.id)
    .eq('natureza', 'saida')
    .eq('pago', false)
    .select('id')

  if (error) return { error: error.message }
  if (!alterados || alterados.length === 0) return { error: 'Conta não encontrada ou já paga.' }

  if (input.descricao !== undefined) {
    const { error: erroDescricao } = await supabase.from('financeiro_movimentos')
      .update({ descricao: input.descricao.trim() }).eq('id', input.id).is('tipo_id', null)
    if (erroDescricao) return { error: erroDescricao.message }
  }

  revalidatePath('/financeiro/contas-a-pagar')
  revalidatePath('/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}

export async function excluirMovimento(
  id: string,
  natureza: FinanceiroNatureza,
  escopo: 'este' | 'este_e_proximos' = 'este',
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  // "Este e os próximos" de um pagamento recorrente: apaga os lançamentos da
  // mesma série com data igual ou posterior à deste. Os anteriores ficam.
  let serie: { recorrencia_id: string; data: string } | null = null
  if (escopo === 'este_e_proximos') {
    const { data: alvo, error: erroAlvo } = await supabase
      .from('financeiro_movimentos').select('recorrencia_id, data').eq('id', id).maybeSingle()
    if (erroAlvo) return { error: erroAlvo.message }
    if (alvo?.recorrencia_id) serie = { recorrencia_id: alvo.recorrencia_id, data: alvo.data }
  }

  const { error } = serie
    ? await supabase.from('financeiro_movimentos').delete().eq('recorrencia_id', serie.recorrencia_id).gte('data', serie.data)
    : await supabase.from('financeiro_movimentos').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  if (natureza === 'saida') revalidatePath('/financeiro/contas-a-pagar')
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}
