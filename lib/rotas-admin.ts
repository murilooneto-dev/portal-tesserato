// Fonte única das rotas protegidas pela seção ADMIN (step-up de sessão
// `ts_admin`, independente do login do portal) — consumida tanto pelo
// `proxy.ts` (interceptação/renovação do cookie) quanto por
// `requireAdminSection()` nos Server Components/Server Actions dessas
// páginas. Mesmo padrão de fonte única já usado em `PAGINAS_POR_SETOR`
// (lib/paginas-setor.ts). Novas páginas ADMIN futuras só precisam entrar
// nesta lista.
export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos'] as const

export function ehRotaAdmin(pathname: string): boolean {
  return ROTAS_ADMIN.some(rota => pathname === rota || pathname.startsWith(`${rota}/`))
}
