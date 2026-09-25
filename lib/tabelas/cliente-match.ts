export interface ClienteMatch { id: string; nome: string; cnpj: string | null }
export type StatusMatch = 'exato' | 'sugerido' | 'sem_match'
export interface ResultadoMatch { status: StatusMatch; clienteId: string | null; score: number }
export interface GrupoCliente { valor: string; linhas: number; match: ResultadoMatch }

// Abaixo disso o nome não é sugerido (fica "sem cliente" até o usuário escolher).
export const LIMIAR_SUGESTAO = 0.6

const SUFIXOS = new Set(['ltda', 'eireli', 'epp', 'me', 'mei', 'sa'])

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

export function chaveDocumento(s: string | null | undefined): string {
  const digitos = somenteDigitos(s)
  if (digitos.length >= 12 && digitos.length <= 14) {
    return digitos.padStart(14, '0')
  }
  if (digitos.length >= 10 && digitos.length <= 11) {
    return digitos.padStart(11, '0')
  }
  return ''
}

export function normalizarNome(s: string): string {
  const base = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const limpo = base.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bs a\b/g, 'sa')
  return limpo.split(' ').filter(p => p && !SUFIXOS.has(p)).join(' ')
}

function bigramas(s: string): string[] {
  const t = s.replace(/ /g, '')
  if (t.length < 2) return t ? [t] : []
  const r: string[] = []
  for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2))
  return r
}

// Coeficiente de Dice sobre bigramas do nome normalizado.
export function similaridade(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ba = bigramas(na)
  const bb = bigramas(nb)
  if (!ba.length || !bb.length) return 0
  const contagem = new Map<string, number>()
  for (const x of bb) contagem.set(x, (contagem.get(x) ?? 0) + 1)
  let inter = 0
  for (const x of ba) {
    const c = contagem.get(x) ?? 0
    if (c > 0) { inter++; contagem.set(x, c - 1) }
  }
  return (2 * inter) / (ba.length + bb.length)
}

export function casarCliente(valor: string | null | undefined, clientes: ClienteMatch[]): ResultadoMatch {
  const v = (valor ?? '').trim()
  if (!v) return { status: 'sem_match', clienteId: null, score: 0 }

  const chave = chaveDocumento(v)
  if (chave) {
    const porDoc = clientes.filter(c => chaveDocumento(c.cnpj) === chave)
    // Documento repetido em mais de um cliente é ambíguo: o usuário escolhe.
    if (porDoc.length === 1) return { status: 'exato', clienteId: porDoc[0].id, score: 1 }
    if (porDoc.length > 1) return { status: 'sugerido', clienteId: porDoc[0].id, score: 1 }
  }

  let melhor: ClienteMatch | null = null
  let melhorScore = 0
  let empatados = 0
  for (const c of clientes) {
    const s = similaridade(v, c.nome)
    if (s > melhorScore) { melhorScore = s; melhor = c; empatados = 1 } else if (s === melhorScore && s > 0) empatados++
  }
  if (melhor && melhorScore === 1) {
    // Mesmo nome normalizado em vários clientes (matriz/filial): não liga sozinho.
    return { status: empatados > 1 ? 'sugerido' : 'exato', clienteId: melhor.id, score: 1 }
  }
  if (melhor && melhorScore >= LIMIAR_SUGESTAO) return { status: 'sugerido', clienteId: melhor.id, score: melhorScore }
  return { status: 'sem_match', clienteId: null, score: melhorScore }
}

export function agruparValoresCliente(
  valores: (string | number | null)[],
  clientes: ClienteMatch[],
): GrupoCliente[] {
  const contagem = new Map<string, number>()
  for (const v of valores) {
    const s = v === null || v === undefined ? '' : String(v).trim()
    if (!s) continue
    contagem.set(s, (contagem.get(s) ?? 0) + 1)
  }
  return Array.from(contagem, ([valor, linhas]) => ({ valor, linhas, match: casarCliente(valor, clientes) }))
}
