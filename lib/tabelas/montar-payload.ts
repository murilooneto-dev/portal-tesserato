import { TIPOS_COLUNA, paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export const LIMITE_LINHAS = 5000
export const SETORES_TABELA = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'] as const
export type SetorTabela = typeof SETORES_TABELA[number]

const MAX_COLUNAS = 100
const MAX_TEXTO = 120
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ColunaConfig {
  id: string
  nome: string
  tipo: TipoColuna
  opcoes: OpcaoColuna[] | null
  indiceOrigem: number
}
export interface ColunaPayload { id: string; nome: string; tipo: TipoColuna; ordem: number; opcoes: OpcaoColuna[] | null }
export interface LinhaPayload { dados: Record<string, ValorCelula>; clienteId: string | null; ordem: number }
export interface PayloadCriacao {
  setor: SetorTabela
  nome: string
  colunaChaveId: string | null
  colunas: ColunaPayload[]
  linhas: LinhaPayload[]
}

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// Converte cada célula pro tipo da coluna. O que não converte fica como o
// texto original (nunca some) e é contado pra avisar o usuário.
export function montarLinhas(
  linhasBrutas: ValorCelula[][],
  colunas: ColunaConfig[],
  clientePorLinha: (string | null)[],
): { linhas: LinhaPayload[]; naoConvertidas: number } {
  let naoConvertidas = 0
  const linhas = linhasBrutas.map((bruta, i) => {
    const dados: Record<string, ValorCelula> = {}
    for (const col of colunas) {
      const raw = bruta[col.indiceOrigem] ?? null
      if (vazio(raw)) { dados[col.id] = null; continue }
      if (col.tipo === 'numero') {
        const n = paraNumero(raw)
        if (n === null) { naoConvertidas++; dados[col.id] = String(raw) } else dados[col.id] = n
      } else if (col.tipo === 'data') {
        const d = paraDataISO(raw)
        if (d === null) { naoConvertidas++; dados[col.id] = String(raw) } else dados[col.id] = d
      } else {
        dados[col.id] = typeof raw === 'number' ? raw : String(raw).trim()
      }
    }
    return { dados, clienteId: clientePorLinha[i] ?? null, ordem: i }
  })
  return { linhas, naoConvertidas }
}

type Resultado = { ok: true; payload: PayloadCriacao } | { ok: false; erro: string }
const falha = (erro: string): Resultado => ({ ok: false, erro })
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// A UI nunca deveria mandar nada inválido, mas a Server Action é uma
// fronteira pública: tudo é revalidado aqui.
export function validarPayload(entrada: unknown): Resultado {
  if (!ehObjeto(entrada)) return falha('Dados inválidos.')

  const setor = entrada.setor
  if (typeof setor !== 'string' || !(SETORES_TABELA as readonly string[]).includes(setor)) return falha('Setor inválido.')

  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : ''
  if (!nome) return falha('Informe o nome da tabela.')
  if (nome.length > MAX_TEXTO) return falha(`O nome da tabela pode ter no máximo ${MAX_TEXTO} caracteres.`)

  if (!Array.isArray(entrada.colunas) || entrada.colunas.length === 0) return falha('A tabela precisa de pelo menos uma coluna.')
  if (entrada.colunas.length > MAX_COLUNAS) return falha(`No máximo ${MAX_COLUNAS} colunas.`)

  const ids = new Set<string>()
  const colunas: ColunaPayload[] = []
  let qtdCliente = 0
  for (const c of entrada.colunas) {
    if (!ehObjeto(c)) return falha('Coluna inválida.')
    if (typeof c.id !== 'string' || !UUID.test(c.id)) return falha('Identificador de coluna inválido.')
    if (ids.has(c.id)) return falha('Identificador de coluna repetido.')
    ids.add(c.id)
    const nomeCol = typeof c.nome === 'string' ? c.nome.trim() : ''
    if (!nomeCol || nomeCol.length > MAX_TEXTO) return falha('Cada coluna precisa de um nome de até 120 caracteres.')
    if (typeof c.tipo !== 'string' || !(TIPOS_COLUNA as string[]).includes(c.tipo)) return falha('Tipo de coluna inválido.')
    if (c.tipo === 'cliente') qtdCliente++
    let opcoes: OpcaoColuna[] | null = null
    if (c.tipo === 'opcoes') {
      if (!Array.isArray(c.opcoes)) return falha('Coluna de opções sem lista de opções.')
      opcoes = []
      for (const o of c.opcoes) {
        if (!ehObjeto(o) || typeof o.valor !== 'string' || typeof o.cor !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.cor)) {
          return falha('Opção inválida.')
        }
        opcoes.push({ valor: o.valor.slice(0, 60), cor: o.cor })
      }
    }
    colunas.push({ id: c.id, nome: nomeCol, tipo: c.tipo as TipoColuna, ordem: colunas.length, opcoes })
  }
  if (qtdCliente > 1) return falha('Só pode haver uma coluna do tipo Cliente.')

  let colunaChaveId: string | null = null
  if (entrada.colunaChaveId !== null && entrada.colunaChaveId !== undefined) {
    if (typeof entrada.colunaChaveId !== 'string' || !ids.has(entrada.colunaChaveId)) return falha('Coluna-chave inexistente.')
    colunaChaveId = entrada.colunaChaveId
  }

  if (!Array.isArray(entrada.linhas)) return falha('Linhas inválidas.')
  if (entrada.linhas.length > LIMITE_LINHAS) return falha('O limite é de 5.000 linhas por tabela nesta versão.')

  const linhas: LinhaPayload[] = []
  for (const l of entrada.linhas) {
    if (!ehObjeto(l) || !ehObjeto(l.dados)) return falha('Linha inválida.')
    const dados: Record<string, ValorCelula> = {}
    for (const [k, v] of Object.entries(l.dados)) {
      if (!ids.has(k)) return falha('Linha com valor para coluna inexistente.')
      if (v !== null && typeof v !== 'string' && typeof v !== 'number') return falha('Valor de célula inválido.')
      dados[k] = typeof v === 'string' ? v.slice(0, 5000) : v
    }
    let clienteId: string | null = null
    if (l.clienteId !== null && l.clienteId !== undefined) {
      if (typeof l.clienteId !== 'string' || !UUID.test(l.clienteId)) return falha('Cliente da linha inválido.')
      clienteId = l.clienteId
    }
    linhas.push({ dados, clienteId, ordem: linhas.length })
  }

  return { ok: true, payload: { setor: setor as SetorTabela, nome, colunaChaveId, colunas, linhas } }
}
