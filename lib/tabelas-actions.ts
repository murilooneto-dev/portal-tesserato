// lib/tabelas-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { validarPayload } from './tabelas/montar-payload'

export async function criarPlanilha(entrada: unknown): Promise<{ error: string | null; id?: string }> {
  const validado = validarPayload(entrada)
  if (!validado.ok) return { error: validado.erro }
  const p = validado.payload

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  // Mesma regra de quem configura o setor (ver podeConfigurarSetor em
  // lib/tarefa-tipo-vinculos-actions.ts): admin ou configuracoes:<setor>.
  const { data: profile } = await supabase
    .from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', p.setor)) return { error: 'Acesso negado.' }

  const { data, error } = await supabase.rpc('criar_planilha', {
    p_setor: p.setor,
    p_nome: p.nome,
    p_criado_por: user.id,
    p_coluna_chave: p.colunaChaveId,
    p_colunas: p.colunas,
    p_linhas: p.linhas,
  })
  if (error || !data) return { error: error?.message ?? 'Não foi possível criar a tabela.' }

  revalidatePath(`/${p.setor}/tabelas`)
  return { error: null, id: data as string }
}
