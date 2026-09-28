import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export interface ColunaExistente { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
export interface ColunaCasada extends ColunaExistente { indiceOrigem: number }
export interface ColunaNaoReconhecida { nome: string; indiceOrigem: number }
export interface CasamentoColunas { casadas: ColunaCasada[]; naoReconhecidas: ColunaNaoReconhecida[] }

// Casa cabeçalho do arquivo com coluna já existente pelo NOME (sem
// diferenciar maiúsculas/minúsculas, aparado) — robusto a reordenação de
// colunas no arquivo original.
export function casarColunas(cabecalhos: string[], existentes: ColunaExistente[]): CasamentoColunas {
  const porNome = new Map(existentes.map(c => [c.nome.trim().toLowerCase(), c]))
  const casadas: ColunaCasada[] = []
  const naoReconhecidas: ColunaNaoReconhecida[] = []
  cabecalhos.forEach((cab, indiceOrigem) => {
    const achada = porNome.get(cab.trim().toLowerCase())
    if (achada) casadas.push({ ...achada, indiceOrigem })
    else naoReconhecidas.push({ nome: cab, indiceOrigem })
  })
  return { casadas, naoReconhecidas }
}

export function chavesDuplicadas(valoresChave: (string | null)[]): string[] {
  const contagem = new Map<string, number>()
  for (const v of valoresChave) {
    if (v === null) continue
    const k = v.trim()
    if (k === '') continue
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return Array.from(contagem.entries()).filter(([, n]) => n > 1).map(([k]) => k)
}

export interface LinhaExistente { id: string; dados: Record<string, ValorCelula> }
export interface LinhaImportada { indiceOrigem: number; chaveValor: string; dados: Record<string, ValorCelula> }
export interface CelulaAlterada { coluna: string; de: ValorCelula; para: ValorCelula }
export interface LinhaNova { indiceOrigem: number; dados: Record<string, ValorCelula> }
export interface LinhaAtualizar {
  linhaId: string
  indiceOrigem: number
  semConflito: CelulaAlterada[]
  comConflito: CelulaAlterada[]
}
export interface DiffReenvio { novas: LinhaNova[]; atualizar: LinhaAtualizar[]; ausentes: LinhaExistente[] }

const vazio = (v: ValorCelula) => v === null || (typeof v === 'string' && v.trim() === '')

// Casa cada linha importada com uma linha existente pela coluna-chave.
// Célula vazia no banco recebendo valor novo é preenchimento (sem
// conflito); célula com valor não-vazio e diferente é conflito. A
// coluna-chave nunca entra no diff (por definição não muda).
export function calcularDiffReenvio(
  linhasImportadas: LinhaImportada[],
  linhasExistentes: LinhaExistente[],
  colunaChaveId: string,
): DiffReenvio {
  const existentesPorChave = new Map<string, LinhaExistente>()
  for (const l of linhasExistentes) {
    const chave = l.dados[colunaChaveId]
    if (chave !== null && chave !== undefined && String(chave).trim() !== '') {
      existentesPorChave.set(String(chave).trim(), l)
    }
  }

  const tocadas = new Set<string>()
  const novas: LinhaNova[] = []
  const atualizar: LinhaAtualizar[] = []

  for (const imp of linhasImportadas) {
    const existente = existentesPorChave.get(imp.chaveValor)
    if (!existente) {
      novas.push({ indiceOrigem: imp.indiceOrigem, dados: imp.dados })
      continue
    }
    tocadas.add(imp.chaveValor)
    const semConflito: CelulaAlterada[] = []
    const comConflito: CelulaAlterada[] = []
    for (const [coluna, novo] of Object.entries(imp.dados)) {
      if (coluna === colunaChaveId) continue
      const atual = existente.dados[coluna] ?? null
      if (atual === novo) continue
      if (vazio(atual)) semConflito.push({ coluna, de: atual, para: novo })
      else comConflito.push({ coluna, de: atual, para: novo })
    }
    if (semConflito.length > 0 || comConflito.length > 0) {
      atualizar.push({ linhaId: existente.id, indiceOrigem: imp.indiceOrigem, semConflito, comConflito })
    }
  }

  const ausentes = linhasExistentes.filter(l => {
    const chave = l.dados[colunaChaveId]
    const chaveStr = chave === null || chave === undefined ? '' : String(chave).trim()
    return chaveStr !== '' && !tocadas.has(chaveStr)
  })

  return { novas, atualizar, ausentes }
}

export type ResolucaoConflito = 'sistema' | 'planilha'

// Monta a lista flat de células a escrever: sem-conflito sempre entra;
// com-conflito só entra se a linha foi resolvida como "usar planilha" (o
// padrão — resolução ausente do mapa — é "manter sistema", que pula as
// células em conflito mas ainda aplica os preenchimentos da mesma linha).
export function montarAtualizacoes(
  linhas: LinhaAtualizar[],
  resolucoes: Record<string, ResolucaoConflito>,
): { linha: string; coluna: string; de: ValorCelula; para: ValorCelula }[] {
  const saida: { linha: string; coluna: string; de: ValorCelula; para: ValorCelula }[] = []
  for (const l of linhas) {
    for (const c of l.semConflito) saida.push({ linha: l.linhaId, coluna: c.coluna, de: c.de, para: c.para })
    if (l.comConflito.length > 0 && resolucoes[l.linhaId] === 'planilha') {
      for (const c of l.comConflito) saida.push({ linha: l.linhaId, coluna: c.coluna, de: c.de, para: c.para })
    }
  }
  return saida
}
