import { TIPOS_COLUNA, paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export const LIMITE_LINHAS = 5000
export const SETORES_TABELA = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'] as const
export type SetorTabela = typeof SETORES_TABELA[number]

export const MAX_COLUNAS = 100
// Folga sobre o limite de 4 MB do corpo da Server Action.
export const LIMITE_BYTES_PAYLOAD = 3_800_000
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
// Linha enviada pela UI: valores em ordem de coluna (sem repetir o id de cada coluna).
export interface LinhaCompacta { v: ValorCelula[]; clienteId: string | null }
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
): { linhas: LinhaCompacta[]; naoConvertidas: number } {
  let naoConvertidas = 0
  const linhas = linhasBrutas.map((bruta, i) => {
    const v: ValorCelula[] = []
    for (const col of colunas) {
      const raw = bruta[col.indiceOrigem] ?? null
      if (vazio(raw)) { v.push(null); continue }
      if (col.tipo === 'numero') {
        const n = paraNumero(raw)
        if (n === null) { naoConvertidas++; v.push(String(raw)) } else v.push(n)
      } else if (col.tipo === 'data') {
        const d = paraDataISO(raw)
        if (d === null) { naoConvertidas++; v.push(String(raw)) } else v.push(d)
      } else {
        // texto, opções e cliente ficam como string (CNPJ/códigos numéricos não viram número)
        v.push(col.tipo === 'texto' && typeof raw === 'number' ? raw : String(raw).trim())
      }
    }
    return { v, clienteId: clientePorLinha[i] ?? null }
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
  const nomesVistos = new Set<string>()
  const colunas: ColunaPayload[] = []
  let qtdCliente = 0
  for (const c of entrada.colunas) {
    if (!ehObjeto(c)) return falha('Coluna inválida.')
    if (typeof c.id !== 'string' || !UUID.test(c.id)) return falha('Identificador de coluna inválido.')
    if (ids.has(c.id)) return falha('Identificador de coluna repetido.')
    ids.add(c.id)
    const nomeCol = typeof c.nome === 'string' ? c.nome.trim() : ''
    if (!nomeCol || nomeCol.length > MAX_TEXTO) return falha('Cada coluna precisa de um nome de até 120 caracteres.')
    if (nomesVistos.has(nomeCol.toLowerCase())) return falha(`Nome de coluna repetido: "${nomeCol}" (nomes iguais, ignorando maiúsculas/minúsculas).`)
    nomesVistos.add(nomeCol.toLowerCase())
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
    if (!ehObjeto(l) || !Array.isArray(l.v) || l.v.length !== colunas.length) return falha('Linha inválida.')
    const dados: Record<string, ValorCelula> = {}
    for (let i = 0; i < colunas.length; i++) {
      const v: unknown = l.v[i]
      if (v !== null && typeof v !== 'string' && typeof v !== 'number') return falha('Valor de célula inválido.')
      dados[colunas[i].id] = typeof v === 'string' ? v.slice(0, 5000) : v
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
