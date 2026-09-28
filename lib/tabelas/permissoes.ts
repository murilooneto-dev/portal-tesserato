import type { SetorTabela } from './montar-payload'

interface Perfil { role?: string | null; setores?: string[] | null }

// Regra do spec: todo o setor edita células e linhas; Admin edita qualquer
// setor. (Estrutura — colunas, excluir tabela — é outra regra, da Fase 2B.)
export function podeEditarLinhas(perfil: Perfil | null | undefined, setor: SetorTabela): boolean {
  return perfil?.role === 'admin' || (perfil?.setores ?? []).includes(setor)
}
