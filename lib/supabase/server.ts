import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Service role client — bypassa RLS; requer SUPABASE_SERVICE_ROLE_KEY no Vercel
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada. Adicione em: Vercel → Settings → Environment Variables')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Client SSR — usa cookies da sessão; para leituras e verificação de auth
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Helper para server actions:
// - verifica identidade via getUser() (sempre funciona, vai ao servidor Supabase)
// - usa service role se disponível (bypassa RLS)
// - cai para cliente com JWT explícito se service role não configurada
//   (funciona quando RLS permite authenticated + proxy.ts renova o token)
export async function getAuthenticatedAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, supabase: null }

  // Tenta service role primeiro (mais confiável)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { user, supabase: createAdminClient() }
  }

  // Fallback: cliente com JWT explícito do usuário autenticado
  // Requer que RLS permita role "authenticated" (ver SQL no CHANGELOG)
  const { data: { session } } = await authClient.auth.getSession()
  if (!session?.access_token) {
    console.error('getAuthenticatedAdmin: sem sessão válida. Adicione SUPABASE_SERVICE_ROLE_KEY no Vercel.')
    return { user: null, supabase: null }
  }
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
  return { user, supabase }
}
