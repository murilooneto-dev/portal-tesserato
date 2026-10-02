// lib/clientes-geral.ts — filtros e ordem do Cadastro de clientes (tela geral).
import { SETORES, type UserSetor } from './types'

/** Setores em que um cliente pode aparecer ("Configurações" é setor de usuário, não de cliente). */
export const SETORES_DE_CLIENTE: UserSetor[] = SETORES.filter(s => s !== 'configuracoes')
export const TODOS = 'TODOS'

export interface ClienteGeralLinha {
  nome: string
  cnpj: string | null
  setores: UserSetor[] | null
  clientes_fiscal: { regime: string | null; atividade: string[] | null } | null
}
export interface FiltrosClientesGeral { busca: string; regime: string; setor: string; atividades: string[] }
export type CampoOrdem = 'nome' | 'regime'
export type Ordenacao = { campo: CampoOrdem; direcao: 'asc' | 'desc' } | null

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const soDigitos = (s: string) => s.replace(/\D/g, '')

export function filtrarClientesGeral<T extends ClienteGeralLinha>(lista: T[], f: FiltrosClientesGeral, ordem: Ordenacao): T[] {
  const termo = semAcento(f.busca.trim())
  // Só compara com o CNPJ quando o texto parece CNPJ (sem letras) e tem ao menos 3 dígitos.
  const pareceCnpj = /^[\d.\/\-\s]+$/.test(f.busca.trim())
  const digitos = pareceCnpj ? soDigitos(f.busca) : ''
  const filtrados = lista.filter(c => {
    if (termo) {
      const noNome = semAcento(c.nome).includes(termo)
      const noCnpj = digitos.length >= 3 && soDigitos(c.cnpj ?? '').includes(digitos)
      if (!noNome && !noCnpj) return false
    }
    if (f.regime !== TODOS && c.clientes_fiscal?.regime !== f.regime) return false
    if (f.setor !== TODOS && !(c.setores ?? []).includes(f.setor as UserSetor)) return false
    if (f.atividades.length > 0 && !f.atividades.some(a => (c.clientes_fiscal?.atividade ?? []).includes(a))) return false
    return true
  })
  if (!ordem) return filtrados
  const chave = (c: T) => semAcento(ordem.campo === 'nome' ? c.nome : c.clientes_fiscal?.regime ?? '')
  return [...filtrados].sort((a, b) => {
    const r = chave(a).localeCompare(chave(b), 'pt-BR')
    return ordem.direcao === 'asc' ? r : -r
  })
}

/** Crescente → decrescente → sem ordem. */
export function proximaOrdenacao(atual: Ordenacao, campo: CampoOrdem): Ordenacao {
  if (atual?.campo !== campo) return { campo, direcao: 'asc' }
  return atual.direcao === 'asc' ? { campo, direcao: 'desc' } : null
}

export function ariaSort(ordem: Ordenacao, campo: CampoOrdem): 'ascending' | 'descending' | 'none' {
  if (ordem?.campo !== campo) return 'none'
  return ordem.direcao === 'asc' ? 'ascending' : 'descending'
}

export function setoresDoCliente(setores: UserSetor[] | null): UserSetor[] {
  return SETORES_DE_CLIENTE.filter(s => (setores ?? []).includes(s))
}
