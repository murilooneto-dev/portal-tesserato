import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SETOR_HOME, type UserSetor } from '@/lib/types'

const PREFIXOS_SETOR: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

// Páginas fora do sistema de permissão granular por página: sempre
// liberadas pra qualquer usuário que tenha o setor (não aparecem no menu
// nem na tela de permissões, mas continuam acessíveis por URL direta).
// `dashboard` é a home de cada setor (nunca pode ser bloqueada, senão o
// usuário fica sem destino de redirecionamento). agenda/bots/tarefas são
// páginas operacionais por-usuário do Fiscal, que operadores já usam por
// URL direta hoje — não são gerenciadas pela permissão por página.
const PAGINAS_SEMPRE_LIBERADAS = ['dashboard', 'agenda', 'bots', 'tarefas']

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
      .select('setores, role, paginas_acesso')
      .eq('id', user.id)
      .single()

    const podeAcessarSetor = profile?.role === 'admin' || (profile?.setores ?? []).includes(setorDaRota)

    const resto = pathname.slice(`/${setorDaRota}`.length).replace(/^\//, '')
    const pagina = resto.split('/')[0] || 'dashboard'
    const podeAcessarPagina =
      profile?.role === 'admin' ||
      PAGINAS_SEMPRE_LIBERADAS.includes(pagina) ||
      (profile?.paginas_acesso ?? []).includes(`${setorDaRota}:${pagina}`)

    if (!podeAcessarSetor || !podeAcessarPagina) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      const destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|logo\\.ico|logo\\.png).*)',
      // Prefetch requests (disparados em massa pelos <Link> do Sidebar/TopNav
      // assim que entram no viewport) não devem chamar supabase.auth.getUser().
      // Cada chamada pode disparar um refresh de token; como o refresh token
      // do Supabase é rotacionado (invalidado após o primeiro uso), várias
      // requisições concorrentes usando o mesmo cookie de sessão faziam a
      // maioria delas falhar com "refresh token already used" e cair no
      // redirect de login — mesmo com o usuário autenticado. É esse race
      // condition que explicava o padrão: falha ao navegar (múltiplas
      // requisições simultâneas), mas funciona ao dar F5 (requisição única).
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
