import type { UserSetor } from './types'

export interface PaginaSetor {
  slug: string
  label: string
}

// Fonte única da lista de páginas navegáveis por setor — usada tanto
// pelo menu (components/fiscal/Sidebar.tsx) quanto pelo controle de
// acesso por página (proxy.ts, app/fiscal/parametros). Páginas fora da
// navegação normal (agenda, bots, tarefas) e exclusivas de admin
// (parametros, admin, vinculos) não entram aqui.
export const PAGINAS_POR_SETOR: Record<UserSetor, PaginaSetor[]> = {
  fiscal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'parcelamentos', label: 'Parcelamentos' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
    { slug: 'minhas-tarefas', label: 'Minhas Tarefas' },
  ],
  contabil: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
  ],
  pessoal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
  ],
  societario: [
    { slug: 'procedimentos', label: 'Procedimentos' },
    { slug: 'clientes', label: 'Clientes' },
  ],
  financeiro: [],
}
