// lib/verificar-senha.ts
import { createClient as createClienteDescartavel } from '@supabase/supabase-js'
import { getAuthenticatedAdmin } from './supabase/server'

// Reautentica a senha digitada contra a conta atualmente logada: tenta um
// login com o e-mail da própria sessão num cliente descartável (não mexe nos
// cookies de quem está logado). Não compara senha em texto puro em nenhum
// momento: quem confirma é o próprio Supabase Auth.
export async function verificarSenhaUsuarioAtual(senha: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await getAuthenticatedAdmin()
  if (!user?.email) return { ok: false, error: 'Sessão inválida.' }

  const clienteDescartavel = createClienteDescartavel(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await clienteDescartavel.auth.signInWithPassword({ email: user.email, password: senha })
  if (error) return { ok: false, error: 'Senha incorreta.' }

  return { ok: true }
}
