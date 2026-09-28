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
    { slug: 'tabelas', label: 'Tabelas' },
  ],
  contabil: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
    { slug: 'tabelas', label: 'Tabelas' },
  ],
  pessoal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
    { slug: 'tabelas', label: 'Tabelas' },
  ],
  societario: [
    { slug: 'procedimentos', label: 'Procedimentos' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'tabelas', label: 'Tabelas' },
  ],
  financeiro: [
    { slug: 'recebimentos', label: 'Recebimentos' },
    { slug: 'pagamentos', label: 'Pagamentos' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'tabelas', label: 'Tabelas' },
  ],
  configuracoes: [
    { slug: 'fiscal', label: 'Fiscal' },
    { slug: 'contabil', label: 'Contábil' },
    { slug: 'pessoal', label: 'Pessoal' },
    { slug: 'societario', label: 'Societário' },
    { slug: 'financeiro', label: 'Financeiro' },
  ],
}
