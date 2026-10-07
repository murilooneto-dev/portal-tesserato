import type { UserSetor } from './types'

export interface PaginaSetor {
  slug: string
  label: string
}

// Fonte única da lista de páginas navegáveis por setor — usada tanto
// pelo menu (lib/navegacao.ts) quanto pelo controle de
// acesso por página (proxy.ts, app/fiscal/parametros). Páginas fora da
// navegação normal (agenda, tarefas) e exclusivas de admin
// (parametros, admin, vinculos) não entram aqui.
export const PAGINAS_POR_SETOR: Record<UserSetor, PaginaSetor[]> = {
  fiscal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'parcelamentos', label: 'Parcelamentos' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento rápido' },
    { slug: 'minhas-tarefas', label: 'Minhas tarefas' },
  ],
  contabil: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento rápido' },
  ],
  pessoal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento rápido' },
  ],
  societario: [
    { slug: 'procedimentos', label: 'Procedimentos' },
    { slug: 'clientes', label: 'Clientes' },
  ],
  financeiro: [
    { slug: 'recebimentos', label: 'Recebimentos' },
    { slug: 'contas-a-pagar', label: 'Contas a pagar' },
    { slug: 'pagamentos', label: 'Pagamentos' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
  ],
  configuracoes: [
    { slug: 'fiscal', label: 'Fiscal' },
    { slug: 'contabil', label: 'Contábil' },
    { slug: 'pessoal', label: 'Pessoal' },
    { slug: 'societario', label: 'Societário' },
    { slug: 'financeiro', label: 'Financeiro' },
  ],
}
