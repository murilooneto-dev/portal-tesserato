'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
import type { UserSetor } from '@/lib/types'

// ATENÇÃO (CODE_REVIEW.md / SECURITY_REPORT.md, risco residual de design):
// `exigirAcessoAdmin()` devolve um cliente `service_role`, que ignora a
// RLS `is_admin()` de `tarefa_vinculos`. Isso é intencional — é assim que
// se aplica o gate de `ts_admin`, que a RLS não conhece —, mas significa
// que a RLS deixou de ser rede de proteção neste arquivo: qualquer nova
// Server Action aqui que esqueça de chamar `exigirAcessoAdmin()` escreve
// sem obstáculo nenhum. Toda action neste arquivo deve chamá-la antes de
// qualquer query.
//
// SECURITY_REPORT.md ALTA-1: VinculosClient.tsx escrevia direto em
// tarefa_vinculos a partir do browser (lib/supabase/client), sem Server
// Action nenhuma — só a RLS "Admin gerencia tarefa_vinculos" (is_admin()),
// que não sabe o que é a sessão ts_admin. Movido para Server Actions
// guardadas, na mesma linha do resto da seção ADMIN.
async function exigirAcessoAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return null

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null

  const adminSession = await getValidAdminSession()
  if (!adminSession) return null

  return supabase
}

const ERRO_ACESSO = 'Acesso negado: sessão da área ADMIN expirada ou inválida.'

export async function criarVinculo(input: {
  setorOrigem: UserSetor
  tipoOrigem: string
  setorDestino: UserSetor
  tipoDestino: string
}): Promise<{ error?: string }> {
  const supabase = await exigirAcessoAdmin()
  if (!supabase) return { error: ERRO_ACESSO }

  const { error } = await supabase.from('tarefa_vinculos').insert({
    setor_origem: input.setorOrigem,
    tipo_origem: input.tipoOrigem,
    setor_destino: input.setorDestino,
    tipo_destino: input.tipoDestino,
  })
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
