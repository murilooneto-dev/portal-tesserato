'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthenticatedAdmin } from '@/lib/supabase/server'
import { podeAcessarPagina } from '@/lib/route-permissions'
import { validarNomeEntidade } from '@/lib/config-entidades'
import { erroTarefaEmOutroGrupo, nomeDeGrupoRepetido } from '@/lib/tarefa-grupos-setor'
import type { GrupoSetor } from '@/lib/types'

// Grupos de tarefas por setor (tabela tarefa_grupos_setor, migration 066).
// Por enquanto só o Financeiro; a coluna setor já deixa a porta aberta.
const SETOR = 'financeiro'

// Mesma regra de lib/tarefa-tipo-vinculos-financeiro-actions.ts: admin ou
// quem tem acesso concedido a Configurações → Financeiro.
async function exigirAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(callerProfile, 'configuracoes', 'financeiro')) return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof exigirAdmin>>['supabase']>

async function buscarGrupos(supabase: SupabaseAdmin): Promise<{ data: GrupoSetor[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tarefa_grupos_setor')
    .select('id, nome, tarefas')
    .eq('setor', SETOR)
    .order('nome')
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as GrupoSetor[], error: null }
}

// Leitura liberada pra qualquer usuário logado: a ficha do cliente precisa
// dos grupos. Usa o client da sessão (a policy de select exige autenticado).
export async function listarGruposDoSetorFinanceiro(): Promise<{ data: GrupoSetor[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Sessão inválida.' }
  return buscarGrupos(supabase as unknown as SupabaseAdmin)
}

// Validações comuns à criação e à edição. Devolve o nome já sem espaços nas pontas.
async function validar(
  supabase: SupabaseAdmin, nome: string, tarefas: string[], ignorarId?: string,
): Promise<{ error: string | null; nome: string; tarefas: string[] }> {
  const nomeLimpo = nome.trim()
  const erroNome = validarNomeEntidade(nomeLimpo)
  if (erroNome) return { error: erroNome, nome: nomeLimpo, tarefas }

  const unicas = [...new Set(tarefas)]
  if (unicas.length === 0) return { error: 'Escolha pelo menos uma tarefa.', nome: nomeLimpo, tarefas: unicas }

  const { data: catalogo, error: erroCatalogo } = await supabase
    .from('tarefa_tipos').select('nome').eq('setor', SETOR)
  if (erroCatalogo) return { error: erroCatalogo.message, nome: nomeLimpo, tarefas: unicas }
  const existentes = new Set((catalogo ?? []).map(t => t.nome as string))
  const inexistente = unicas.find(t => !existentes.has(t))
  if (inexistente) return { error: `A tarefa "${inexistente}" não existe no catálogo do Financeiro.`, nome: nomeLimpo, tarefas: unicas }

  const { data: grupos, error: erroGrupos } = await buscarGrupos(supabase)
  if (erroGrupos) return { error: erroGrupos, nome: nomeLimpo, tarefas: unicas }
  if (nomeDeGrupoRepetido(nomeLimpo, grupos, ignorarId)) {
    return { error: `Já existe um grupo chamado "${nomeLimpo}".`, nome: nomeLimpo, tarefas: unicas }
  }
  const erroOutroGrupo = erroTarefaEmOutroGrupo(unicas, grupos, ignorarId)
  if (erroOutroGrupo) return { error: erroOutroGrupo, nome: nomeLimpo, tarefas: unicas }

  return { error: null, nome: nomeLimpo, tarefas: unicas }
}

function revalidar() {
  revalidatePath('/admin/configuracoes')
  revalidatePath('/financeiro/clientes', 'layout')
}

export async function criarGrupoSetorFinanceiro(nome: string, tarefas: string[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const v = await validar(supabase, nome, tarefas)
  if (v.error) return { error: v.error }

  const { error: insertError } = await supabase
    .from('tarefa_grupos_setor').insert({ setor: SETOR, nome: v.nome, tarefas: v.tarefas })
  if (insertError) {
    return { error: insertError.code === '23505' ? `Já existe um grupo chamado "${v.nome}".` : insertError.message }
  }

  revalidar()
  return { error: null }
}

export async function atualizarGrupoSetorFinanceiro(id: string, nome: string, tarefas: string[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: atual } = await supabase.from('tarefa_grupos_setor').select('id').eq('id', id).eq('setor', SETOR).single()
  if (!atual) return { error: 'Grupo não encontrado.' }

  const v = await validar(supabase, nome, tarefas, id)
  if (v.error) return { error: v.error }

  const { error: updateError } = await supabase
    .from('tarefa_grupos_setor').update({ nome: v.nome, tarefas: v.tarefas }).eq('id', id).eq('setor', SETOR)
  if (updateError) {
    return { error: updateError.code === '23505' ? `Já existe um grupo chamado "${v.nome}".` : updateError.message }
  }

  revalidar()
  return { error: null }
}

// Excluir o grupo não mexe nas tarefas: elas só voltam a aparecer soltas.
export async function excluirGrupoSetorFinanceiro(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: deleteError } = await supabase
    .from('tarefa_grupos_setor').delete().eq('id', id).eq('setor', SETOR)
  if (deleteError) return { error: deleteError.message }

  revalidar()
  return { error: null }
}
