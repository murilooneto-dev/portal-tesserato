'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, createClient, createAdminClient } from './supabase/server'
import { validarNomeEntidade, normalizarNome } from './config-entidades'
import { datasRecorrentes, datasSeguintesDaSerie } from './financeiro-movimentos'
import { hojeISO } from './mes-atual'
import { separarEmails } from './financeiro-aviso-vencimento'
import { enviarAvisoVencimento } from './financeiro-aviso-vencimento-envio'
import type { FinanceiroNatureza, FinanceiroTipo, FinanceiroCentroCusto } from './types'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

// Usada só nas ações de CRIAR tipo/centro de custo — permite que qualquer
// usuário do setor financeiro cadastre um item novo direto do modal de
// lançamento, sem precisar de um admin. Renomear/ativar/excluir continuam
// exigindo admin (exigirAdmin), gerenciados só em Configurações.
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
    .select('id, natureza, nome, ativo')
    .eq('natureza', natureza)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as FinanceiroTipo[], error: null }
}

export async function criarFinanceiroTipo(
  natureza: FinanceiroNatureza,
  nome: string,
): Promise<{ error: string | null }> {
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
 * Manda agora, para o e-mail já salvo, o aviso dos pagamentos recorrentes que
 * vencem amanhã. Não conta como o envio do dia.
 */
export async function enviarTesteAvisoVencimento(): Promise<{ mensagem: string | null; error: string | null }> {
  const { error } = await exigirAdmin()
  if (error) return { mensagem: null, error }

  try {
    const resultado = await enviarAvisoVencimento(createAdminClient(), { teste: true })
    if (resultado.status === 'sem_destinatario') return { mensagem: null, error: 'Salve um e-mail antes de enviar o teste.' }
    if (resultado.status !== 'enviado') return { mensagem: null, error: 'O teste não foi enviado.' }
    const lista = resultado.quantidade === 0
      ? 'sem pagamentos vencendo amanhã'
      : resultado.quantidade === 1 ? 'com 1 pagamento' : `com ${resultado.quantidade} pagamentos`
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
  /** Só pagamentos: repete o lançamento no mesmo dia de cada mês até dezembro. */
  recorrente?: boolean
}): Promise<{ id: string; quantidade: number } | { error: string }> {
  if (!input.tipoId) return { error: 'Selecione o tipo.' }
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  // Recorrente: um lançamento por mês, todos com o mesmo recorrencia_id, num
  // único insert (ou entram todos, ou nenhum). Lançado em dezembro não há mês
  // seguinte, então vira um lançamento comum, sem série.
  // Os lançamentos da série nascem "a pagar" (pago = false): registram só que
  // a conta vai existir naquela data; o usuário confirma cada um quando paga.
  let datas = [input.data]
  if (input.recorrente && input.natureza === 'saida') {
    datas = datasRecorrentes(input.data)
    if (datas.length === 0) return { error: 'Selecione a data.' }
  }
  const recorrenciaId = datas.length > 1 ? crypto.randomUUID() : null

  const { data: novos, error } = await supabase.from('financeiro_movimentos').insert(datas.map(data => ({
    natureza: input.natureza,
    tipo_id: input.tipoId,
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data,
    observacao: input.observacao,
    criado_por: user.id,
    recorrencia_id: recorrenciaId,
    pago: recorrenciaId === null,
  }))).select('id, data')

  const novo = novos?.find(n => n.data === input.data) ?? novos?.[0]
  if (error || !novo) return { error: error?.message ?? 'Falha ao criar movimento.' }

  revalidatePath(input.natureza === 'entrada' ? '/financeiro/recebimentos' : '/financeiro/pagamentos')
  revalidatePath('/financeiro/relatorios')
  return { id: novo.id, quantidade: novos?.length ?? 1 }
}

export async function atualizarMovimento(input: {
  id: string
  natureza: FinanceiroNatureza
  tipoId: string
  centroCustoId: string | null
  valor: number
  data: string
  observacao: string | null
  /**
   * Só pagamentos que ainda não são recorrentes: este vira o primeiro de uma
   * série e os meses seguintes (de hoje em diante, até dezembro) são criados
   * "a pagar". Este lançamento não muda de situação.
   */
  tornarRecorrente?: boolean
}): Promise<{ error: string | null }> {
  if (!input.tipoId) return { error: 'Selecione o tipo.' }
  if (!input.data) return { error: 'Selecione a data.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { error: 'Informe um valor válido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const campos = {
    tipo_id: input.tipoId,
    centro_custo_id: input.centroCustoId,
    valor: input.valor,
    data: input.data,
    observacao: input.observacao,
  }

  // Sem mês seguinte a vencer não há série: salva como edição comum.
  const datasNovas = input.tornarRecorrente && input.natureza === 'saida'
    ? datasSeguintesDaSerie(input.data, hojeISO())
    : []

  if (datasNovas.length > 0) {
    const recorrenciaId = crypto.randomUUID()
    // `.is('recorrencia_id', null)`: quem já é de uma série não entra em outra.
    const { data: alterados, error: erroSerie } = await supabase.from('financeiro_movimentos')
      .update({ ...campos, recorrencia_id: recorrenciaId })
      .eq('id', input.id)
      .eq('natureza', 'saida')
      .is('recorrencia_id', null)
      .select('id')
    if (erroSerie) return { error: erroSerie.message }
    if (!alterados || alterados.length === 0) return { error: 'Este pagamento já é recorrente ou não foi encontrado.' }

    const { error: erroNovos } = await supabase.from('financeiro_movimentos').insert(datasNovas.map(data => ({
      natureza: 'saida',
      ...campos,
      data,
      criado_por: user.id,
      recorrencia_id: recorrenciaId,
      pago: false,
    })))
    if (erroNovos) {
      // Os meses seguintes não entraram: desfaz o vínculo pra não sobrar série de um lançamento só.
      await supabase.from('financeiro_movimentos').update({ recorrencia_id: null }).eq('id', input.id)
      return { error: erroNovos.message }
    }

    revalidatePath('/financeiro/pagamentos')
    revalidatePath('/financeiro/relatorios')
    return { error: null }
  }

  const { error } = await supabase.from('financeiro_movimentos').update(campos).eq('id', input.id)

  if (error) return { error: error.message }

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

  const { data: alterados, error } = await supabase.from('financeiro_movimentos')
    .update({ pago, pago_em: pago ? hojeISO() : null })
    .eq('id', id)
    .eq('natureza', 'saida')
    .select('id')

  if (error) return { error: error.message }
  if (!alterados || alterados.length === 0) return { error: 'Pagamento não encontrado.' }

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
  revalidatePath('/financeiro/relatorios')
  return { error: null }
}
