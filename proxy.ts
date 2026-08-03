import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SETOR_HOME, type UserSetor } from '@/lib/types'
import { ehRotaAdmin } from '@/lib/rotas-admin'
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_INACTIVITY_TTL_SECONDS } from '@/lib/admin-auth/constants'
import { signAdminToken, verifyAdminToken } from '@/lib/admin-auth/session'

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

  // Seção ADMIN (Parâmetros/Vínculos): exige role='admin' do portal *e*
  // sessão própria ts_admin (defesa em profundidade — modelo mais
  // restritivo assumido pela Arquitetura para a feature TES-3). O proxy
  // só verifica assinatura/expiração do JWT (Edge-safe, sem query pesada);
  // a verificação de senha em si acontece só no login, via RPC no Postgres.
  if (ehRotaAdmin(pathname)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/intranet', request.url))
    }

    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    const session = token ? await verifyAdminToken(token) : null

    if (!session || session.mustChangePassword) {
      const url = new URL('/admin/bloqueio', request.url)
      url.searchParams.set('next', pathname)
      if (session?.mustChangePassword) url.searchParams.set('etapa', 'trocar-senha')
      return NextResponse.redirect(url)
    }

    // Renovação por inatividade (sliding window): reemite o cookie a cada
    // acesso válido às rotas ADMIN, preservando `loginAt` para manter o
    // teto de expiração absoluta de 8h.
    const renovado = await signAdminToken({
      sub: session.sub,
      username: session.username,
      mustChangePassword: session.mustChangePassword,
      loginAt: session.loginAt,
    })
    supabaseResponse.cookies.set(ADMIN_SESSION_COOKIE, renovado, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_INACTIVITY_TTL_SECONDS,
    })
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
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|logo\\.ico|logo\\.png).*)'],
}
