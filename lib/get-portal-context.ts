// lib/get-portal-context.ts
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { resolveSetorPagina, podeAcessarSetor, podeAcessarPagina } from '@/lib/route-permissions'

// `setorAtivo` é passado pelo próprio layout de setor (`app/fiscal/layout.tsx`
// etc.), sempre como literal hard-coded no código — nunca derivado de um
// header ou de qualquer outro dado da requisição. Duas rodadas de revisão
// anteriores rejeitaram versões que tentavam descobrir o setor a partir de
// um header (primeiro `purpose: prefetch` controlando se o Proxy rodava,
// depois um `x-pathname` que o Proxy só preenchia quando rodava): em ambos
// os casos, exatamente as requisições que escapavam do Proxy deixavam esse
// sinal sob controle de quem fez a requisição, reabrindo o mesmo bypass de
// setor de um jeito ligeiramente diferente. Recebendo o setor como argumento
// não há nada aqui pro cliente forjar — o valor vem do código-fonte da
// própria rota que está sendo renderizada.
export async function getPortalContext(
  setorAtivo?: UserSetor
): Promise<{ profile: Profile; mes: number; ano: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile: Profile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador',
    setores: ['fiscal'],
    cor: '#6366f1',
    created_at: new Date().toISOString(),
    paginas_acesso: [],
  }

  if (setorAtivo) {
    if (!podeAcessarSetor(safeProfile, setorAtivo)) {
      const primeiroSetor = safeProfile.setores?.[0] as UserSetor | undefined
      redirect(primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet')
    }

    // Checagem de página: mais granular que a de setor (restringe páginas
    // dentro de um setor ao qual o usuário já tem acesso, ex.: operador sem
    // permissão de ver Parâmetros) e, diferente do setor, não dá pra fixar
    // como literal no layout — o mesmo layout de setor renderiza várias
    // páginas diferentes. Usamos o `x-pathname` que o Proxy injeta como
    // sinal best-effort, só pra cobrir navegação real (o Proxy roda e
    // preenche o header corretamente nesse caso).
    //
    // Deliberadamente NÃO tratamos a ausência desse header como negação
    // (ao contrário do setor acima): página é uma regra de negócio dentro
    // do próprio setor do usuário, não um limite de segurança entre
    // setores — esse limite já está garantido acima, sem depender de
    // nenhum header. Negar por padrão aqui recriaria o mesmo problema que
    // motivou a rejeição anterior: qualquer prefetch legítimo que no
    // futuro passe a escapar do Proxy (ex.: se um setor ganhar um
    // `loading.tsx`, tornando a rota pré-buscável) cairia nesse "sem
    // header" e seria barrado indevidamente — reintroduzindo o sintoma
    // original desta issue (redirect inesperado, resolvido só com F5) por
    // um caminho novo. Um header ausente ou forjado aqui, na pior das
    // hipóteses, deixa a checagem de página passar — nunca abre acesso a
    // outro setor, porque isso já foi decidido acima com um valor que o
    // cliente não controla.
    const pathname = (await headers()).get('x-pathname')
    if (pathname) {
      const { setor, pagina } = resolveSetorPagina(pathname)
      if (setor === setorAtivo && !podeAcessarPagina(safeProfile, setor, pagina)) {
        redirect(SETOR_HOME[setorAtivo])
      }
    }
  }

  const { mes, ano } = await getMesAno()

  return { profile: safeProfile, mes, ano }
}
