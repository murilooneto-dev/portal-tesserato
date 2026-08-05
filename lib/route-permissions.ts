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
// usuário fica sem destino de redirecionamento). agenda/bots/tarefas são
// páginas operacionais por-usuário do Fiscal, que operadores já usam por
// URL direta hoje — não são gerenciadas pela permissão por página.
export const PAGINAS_SEMPRE_LIBERADAS = ['dashboard', 'agenda', 'bots', 'tarefas']

interface PerfilPermissao {
  role?: string | null
  setores?: UserSetor[] | null
  paginas_acesso?: string[] | null
}

export function resolveSetorPagina(pathname: string): { setor: UserSetor | null; pagina: string } {
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
