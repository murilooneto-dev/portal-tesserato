// Fonte única das rotas que exigem `profiles.role = 'admin'` — consumida
// tanto pelo `proxy.ts` (checagem de role) quanto pela checagem própria de
// cada página/Server Action dessas rotas. Mesmo padrão de fonte única já
// usado em `PAGINAS_POR_SETOR` (lib/paginas-setor.ts). Novas páginas ADMIN
// futuras só precisam entrar nesta lista.
// /admin/configuracoes NÃO entra aqui: deixou de ser tudo-ou-nada por
// role='admin' e passou a ser controlada pelo sistema de paginas_acesso
// por setor/página (ver lib/route-permissions.ts), igual Fiscal/Pessoal.
export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos'] as const

export function ehRotaAdmin(pathname: string): boolean {
  return ROTAS_ADMIN.some(rota => pathname === rota || pathname.startsWith(`${rota}/`))
}
