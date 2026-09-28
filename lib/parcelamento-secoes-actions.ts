'use server'

import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'

// Parcelamento é um conceito exclusivo do setor Fiscal — a permissão exigida
// é sempre "configuracoes:fiscal", independente de quem chama.
async function contextoConfigFiscal() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' as const }
  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', 'fiscal')) return { error: 'Acesso negado.' as const }
  return { error: null, supabase }
}

export async function criarSecaoParcelamento(nome: string): Promise<{ error: string | null }> {
  const nomeNormalizado = nome.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { error } = await ctx.supabase.from('parcelamento_secoes').insert({ nome: nomeNormalizado })

  if (error) {
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}

export async function renomearSecaoParcelamento(
  id: string,
  nomeNovo: string,
): Promise<{ error: string | null }> {
  const nomeNormalizado = nomeNovo.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { data: secaoAtual } = await ctx.supabase.from('parcelamento_secoes').select('nome').eq('id', id).maybeSingle()
  if (!secaoAtual) return { error: 'Seção não encontrada.' }
  const nomeAntigo = secaoAtual.nome as string
  if (nomeNormalizado === nomeAntigo) return { error: null }

  const { error } = await ctx.supabase
    .from('parcelamento_secoes')
    .update({ nome: nomeNormalizado })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma seção com esse nome.' }
    return { error: error.message }
  }

  const { error: erroCascata } = await ctx.supabase
    .from('parcelamentos')
    .update({ secao: nomeNormalizado })
    .eq('secao', nomeAntigo)

  if (erroCascata) {
    return { error: `Seção renomeada, mas os parcelamentos não foram atualizados: ${erroCascata.message}` }
  }

  return { error: null }
}

export async function removerSecaoParcelamento(id: string): Promise<{ error: string | null }> {
  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { data: secaoAtual } = await ctx.supabase.from('parcelamento_secoes').select('nome').eq('id', id).maybeSingle()
  if (!secaoAtual) return { error: 'Seção não encontrada.' }
  const nome = secaoAtual.nome as string

  const { count, error: erroContagem } = await ctx.supabase
    .from('parcelamentos')
    .select('id', { count: 'exact', head: true })
    .eq('secao', nome)

  if (erroContagem) return { error: erroContagem.message }

  if (count && count > 0) {
    return { error: `Não é possível remover: ${count} parcelamento${count !== 1 ? 's' : ''} usa${count !== 1 ? 'm' : ''} essa seção.` }
  }

  const { error } = await ctx.supabase.from('parcelamento_secoes').delete().eq('id', id)
  if (error) return { error: error.message }

  return { error: null }
}
