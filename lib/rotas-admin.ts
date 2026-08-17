// Fonte única das rotas que exigem `profiles.role = 'admin'` — consumida
// tanto pelo `proxy.ts` (checagem de role) quanto pela checagem própria de
// cada página/Server Action dessas rotas. Mesmo padrão de fonte única já
// usado em `PAGINAS_POR_SETOR` (lib/paginas-setor.ts). Novas páginas ADMIN
// futuras só precisam entrar nesta lista.
export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos', '/admin/configuracoes'] as const

export function ehRotaAdmin(pathname: string): boolean {
  return ROTAS_ADMIN.some(rota => pathname === rota || pathname.startsWith(`${rota}/`))
}
