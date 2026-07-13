import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SETOR_HOME, type UserSetor } from '@/lib/types'

const PREFIXOS_SETOR: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/logo.ico'
  ) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const setorDaRota = PREFIXOS_SETOR.find(s => pathname.startsWith(`/${s}`))
  if (setorDaRota) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setores, role')
      .eq('id', user.id)
      .single()

    const podeAcessar = profile?.role === 'admin' || (profile?.setores ?? []).includes(setorDaRota)

    if (!podeAcessar) {
      const primeiroSetor = (profile?.setores?.[0] ?? 'fiscal') as UserSetor
      return NextResponse.redirect(new URL(SETOR_HOME[primeiroSetor], request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|logo\\.ico|logo\\.png).*)'],
}
