'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import type { UserSetor } from '@/lib/types'

// ATENÇÃO (CODE_REVIEW.md / SECURITY_REPORT.md, risco residual de design):
// `exigirAcessoAdmin()` devolve um cliente `service_role`, que ignora a
// RLS `is_admin()` de `tarefa_vinculos`. A checagem de `role === 'admin'`
// feita aqui é a única barreira desta rota — a RLS não é rede de proteção
// neste arquivo: qualquer nova Server Action aqui que esqueça de chamar
// `exigirAcessoAdmin()` escreve sem obstáculo nenhum. Toda action neste
// arquivo deve chamá-la antes de qualquer query.
//
// SECURITY_REPORT.md ALTA-1: VinculosClient.tsx escrevia direto em
// tarefa_vinculos a partir do browser (lib/supabase/client), sem Server
// Action nenhuma — só a RLS "Admin gerencia tarefa_vinculos" (is_admin()).
// Movido para Server Actions guardadas por `exigirAcessoAdmin()`.
async function exigirAcessoAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return null

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null

  return supabase
}

const ERRO_ACESSO = 'Acesso negado.'

export async function criarVinculos(input: {
  setorOrigem: UserSetor
  setorDestino: UserSetor
  pares: { tipoOrigem: string; tipoDestino: string }[]
}): Promise<{ error?: string }> {
  const supabase = await exigirAcessoAdmin()
  if (!supabase) return { error: ERRO_ACESSO }

  if (input.pares.length === 0) return { error: 'Nenhum par novo pra criar.' }

  // Dedup defensivo: `tarefa_vinculos` não tem constraint única, então uma
  // aba desatualizada, dois admins simultâneos ou um duplo clique podem
  // gerar linha duplicada pro mesmo par lógico. O dedup do cliente
  // (calcularNovosPares) compara com o snapshot renderizado no servidor e
  // não cobre esses casos.
  const unicos = Array.from(new Map(input.pares.map(p => [`${p.tipoOrigem}||${p.tipoDestino}`, p])).values())

  const { error } = await supabase.from('tarefa_vinculos').insert(
    unicos.map(p => ({
      setor_origem: input.setorOrigem,
      tipo_origem: p.tipoOrigem,
      setor_destino: input.setorDestino,
      tipo_destino: p.tipoDestino,
    })),
  )
  if (error) return { error: error.message }

  revalidatePath('/vinculos')
  return {}
}

export async function excluirVinculo(id: string): Promise<{ error?: string }> {
  const supabase = await exigirAcessoAdmin()
  if (!supabase) return { error: ERRO_ACESSO }

  const { error } = await supabase.from('tarefa_vinculos').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/vinculos')
  return {}
}
