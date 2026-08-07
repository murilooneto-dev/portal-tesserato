'use server'

import { getAuthenticatedAdmin } from './supabase/server'

// Apesar do nome, getAuthenticatedAdmin só devolve um client autenticado
// (com service role quando disponível) — não é uma checagem de role admin.
// Mesmo padrão de lib/tarefa-tipos-actions.ts: qualquer usuário autenticado
// pode chamar essas actions.

export async function criarSecaoParcelamento(nome: string): Promise<{ error: string | null }> {
  const nomeNormalizado = nome.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase.from('parcelamento_secoes').insert({ nome: nomeNormalizado })

  if (error) {
    // unique(nome): outra pessoa criou essa seção nesse meio tempo —
    // tratado como sucesso, é exatamente o resultado que queríamos.
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}

export async function renomearSecaoParcelamento(
  id: string,
  nomeAntigo: string,
  nomeNovo: string,
): Promise<{ error: string | null }> {
  const nomeNormalizado = nomeNovo.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }
  if (nomeNormalizado === nomeAntigo) return { error: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('parcelamento_secoes')
    .update({ nome: nomeNormalizado })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma seção com esse nome.' }
    return { error: error.message }
  }

  // secao em parcelamentos é texto livre, não uma FK pra
  // parcelamento_secoes — precisa atualizar manualmente aqui pra nenhum
  // parcelamento existente ficar com um nome de seção que não existe mais
  // no catálogo.
  const { error: erroCascata } = await supabase
    .from('parcelamentos')
    .update({ secao: nomeNormalizado })
    .eq('secao', nomeAntigo)

  if (erroCascata) {
    return { error: `Seção renomeada, mas os parcelamentos não foram atualizados: ${erroCascata.message}` }
  }

  return { error: null }
}

export async function removerSecaoParcelamento(id: string, nome: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { count, error: erroContagem } = await supabase
    .from('parcelamentos')
    .select('id', { count: 'exact', head: true })
    .eq('secao', nome)

  if (erroContagem) return { error: erroContagem.message }

  if (count && count > 0) {
    return { error: `Não é possível remover: ${count} parcelamento${count !== 1 ? 's' : ''} usa${count !== 1 ? 'm' : ''} essa seção.` }
  }

  const { error } = await supabase.from('parcelamento_secoes').delete().eq('id', id)
  if (error) return { error: error.message }

  return { error: null }
}
