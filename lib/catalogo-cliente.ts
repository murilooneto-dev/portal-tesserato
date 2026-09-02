import type { createClient } from '@/lib/supabase/server'
import type { UserSetor } from '@/lib/types'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export interface CatalogoCliente {
  regimes: string[]
  atividades: string[]
}

// Lê as listas ativas de Regimes/Atividades cadastradas em
// /admin/configuracoes para um setor — usado pra popular os selects do
// cadastro de cliente (Fiscal/Contábil/Pessoal). RLS de leitura dessas
// tabelas já libera qualquer autenticado (migration 024), por isso aceita
// o client de sessão normal, sem precisar de service role.
export async function buscarCatalogoCliente(supabase: SupabaseServer, setor: UserSetor): Promise<CatalogoCliente> {
  const [{ data: regimes }, { data: atividades }] = await Promise.all([
    supabase.from('regimes').select('nome').eq('setor', setor).eq('ativo', true).order('nome'),
    supabase.from('atividades').select('nome').eq('setor', setor).eq('ativo', true).order('nome'),
  ])

  return {
    regimes: (regimes ?? []).map(r => r.nome as string),
    atividades: (atividades ?? []).map(a => a.nome as string),
  }
}
