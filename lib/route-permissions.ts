// lib/route-permissions.ts
//
// Fonte única da lógica de autorização por setor/página. Usada tanto pelo
// proxy.ts (primeira linha de defesa, roda antes da navegação real) quanto
// pelo getPortalContext (defesa em profundidade, roda como parte da
// renderização de cada layout de setor). Manter em um único lugar evita que
// as duas camadas divirjam com o tempo.
import type { UserSetor } from '@/lib/types'

export const PREFIXOS_SETOR: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

// Páginas fora do sistema de permissão granular por página: sempre
// liberadas pra qualquer usuário que tenha o setor (não aparecem no menu
// nem na tela de permissões, mas continuam acessíveis por URL direta).
// `dashboard` é a home de cada setor (nunca pode ser bloqueada, senão o
// usuário fica sem destino de redirecionamento). agenda/tarefas são
// páginas operacionais por-usuário do Fiscal, que operadores já usam por
// URL direta hoje — não são gerenciadas pela permissão por página.
export const PAGINAS_SEMPRE_LIBERADAS = ['dashboard', 'agenda', 'tarefas']

// Valida `setor` contra a lista real ANTES de indexar qualquer objeto com
// ele — sem isso, uma string como 'constructor' acha uma propriedade
// herdada do protótipo do JS (Object) em vez de "chave não existe", e a
// checagem de permissão passa sempre. Nunca indexar um Record<UserSetor, ...>
// com um valor não validado primeiro.
export function setorValido(setor: string): setor is UserSetor {
  return (PREFIXOS_SETOR as readonly string[]).includes(setor)
}

interface PerfilPermissao {
  role?: string | null
  setores?: UserSetor[] | null
  paginas_acesso?: string[] | null
}

// Configurações não segue o padrão de prefixo /${setor} dos demais — a
// rota real vive sob /admin/configuracoes/*. Casamento explícito antes do
// genérico, reaproveitando a mesma convenção de 'dashboard' como página
// índice sempre liberada.
const PREFIXO_CONFIGURACOES = '/admin/configuracoes'

export function resolveSetorPagina(pathname: string): { setor: UserSetor | null; pagina: string } {
  if (pathname === PREFIXO_CONFIGURACOES || pathname.startsWith(`${PREFIXO_CONFIGURACOES}/`)) {
    const resto = pathname.slice(PREFIXO_CONFIGURACOES.length).replace(/^\//, '')
    const pagina = resto.split('/')[0] || 'dashboard'
    return { setor: 'configuracoes', pagina }
  }

  const setor = PREFIXOS_SETOR.find(s => pathname.startsWith(`/${s}`)) ?? null
  if (!setor) return { setor: null, pagina: '' }

  const resto = pathname.slice(`/${setor}`.length).replace(/^\//, '')
  const pagina = resto.split('/')[0] || 'dashboard'
  return { setor, pagina }
}

export function podeAcessarSetor(profile: PerfilPermissao | null | undefined, setor: UserSetor): boolean {
  return profile?.role === 'admin' || (profile?.setores ?? []).includes(setor)
}

export function podeAcessarPagina(
  profile: PerfilPermissao | null | undefined,
  setor: UserSetor,
  pagina: string
): boolean {
  return (
    profile?.role === 'admin' ||
    PAGINAS_SEMPRE_LIBERADAS.includes(pagina) ||
    (profile?.paginas_acesso ?? []).includes(`${setor}:${pagina}`)
  )
}
