import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SETOR_HOME, type UserSetor } from '@/lib/types'
import { resolveSetorPagina, podeAcessarSetor, podeAcessarPagina } from '@/lib/route-permissions'
import { ehRotaAdmin } from '@/lib/rotas-admin'
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_INACTIVITY_TTL_SECONDS } from '@/lib/admin-auth/constants'
import { signAdminToken, verifyAdminToken } from '@/lib/admin-auth/session'

// Nome do header que sinaliza pra camada de dados (getPortalContext) que o
// Proxy rodou pra essa navegação. É a base da defesa em profundidade: a
// checagem de setor/página abaixo NÃO é a única em vigor — getPortalContext
// repete a mesma checagem (via lib/route-permissions) antes de renderizar
// qualquer layout de setor. Se esse header não chegar lá (por exemplo, uma
// requisição forjada com "purpose: prefetch" pra escapar do matcher abaixo),
// getPortalContext nega o acesso por padrão em vez de confiar apenas em
// "existe um usuário logado".
const PATHNAME_HEADER = 'x-pathname'

// getUser() pode ter rotacionado o refresh token antes de decidirmos
// redirecionar (login inválido ou setor sem permissão). Um NextResponse.redirect
// novo não carrega os Set-Cookie que ficaram pendurados em `supabaseResponse` —
// sem repassar esses cookies, o navegador guardaria o refresh token antigo
// (já invalidado pelo Supabase) e seria deslogado à força na requisição
// seguinte, mesmo tendo acabado de renovar a sessão com sucesso.
function redirectComCookies(url: URL, origem: NextResponse) {
  const redirect = NextResponse.redirect(url)
  origem.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
  return redirect
}

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

  const buildResponse = () => {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set(PATHNAME_HEADER, pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  let supabaseResponse = buildResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = buildResponse()
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirectComCookies(new URL('/login', request.url), supabaseResponse)
  }

  // Seção ADMIN (Parâmetros/Vínculos): exige role='admin' do portal *e*
  // sessão própria ts_admin (defesa em profundidade — modelo mais
  // restritivo assumido pela Arquitetura para a feature TES-3). O proxy
  // só verifica assinatura/expiração do JWT (Edge-safe, sem query pesada);
  // a verificação de senha em si acontece só no login, via RPC no Postgres.
  if (ehRotaAdmin(pathname)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return redirectComCookies(new URL('/intranet', request.url), supabaseResponse)
    }

    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    const session = token ? await verifyAdminToken(token) : null

    if (!session || session.mustChangePassword) {
      const url = new URL('/admin/bloqueio', request.url)
      url.searchParams.set('next', pathname)
      if (session?.mustChangePassword) url.searchParams.set('etapa', 'trocar-senha')
      return redirectComCookies(url, supabaseResponse)
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

  const { setor: setorDaRota, pagina } = resolveSetorPagina(pathname)
  if (setorDaRota) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setores, role, paginas_acesso')
      .eq('id', user.id)
      .single()

    if (!podeAcessarSetor(profile, setorDaRota) || !podeAcessarPagina(profile, setorDaRota, pagina)) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      const destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      return redirectComCookies(new URL(destino, request.url), supabaseResponse)
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
      //
      // Excluir essas requisições do Proxy também significa que a checagem
      // de setor/página abaixo não roda para elas. Isso é intencional e só é
      // seguro porque getPortalContext (lib/get-portal-context.ts) refaz a
      // mesma checagem como defesa em profundidade antes de renderizar
      // qualquer página protegida — ver PATHNAME_HEADER acima.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
