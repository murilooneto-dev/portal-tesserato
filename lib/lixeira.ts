// lib/lixeira.ts
//
// Regras puras da Lixeira (sem React, sem Supabase): header de autoria, rótulos,
// título/resumo de cada exclusão e agrupamento das linhas guardadas pelo
// trigger (grupo = transação). Spec: docs/superpowers/specs/2026-09-29-lixeira-exclusoes-design.md

export const HEADER_AUTORIA = 'x-app-usuario'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Header que o client de serviço manda para o trigger saber quem apagou.
// Só aceita UUID válido (nada de quebra de linha ou texto livre em header).
export function cabecalhosDeAutoria(usuarioId?: string | null): Record<string, string> {
  return usuarioId && UUID_RE.test(usuarioId) ? { [HEADER_AUTORIA]: usuarioId } : {}
}

export type OrigemAutor = 'sessao' | 'servico' | 'desconhecido'

// Linha devolvida por public.lixeira_listar (sem o conteúdo da linha apagada).
export interface LinhaLixeira {
  id: number
  grupo: number
  tabela: string
  registro_id: string | null
  campos: Record<string, string>
  excluido_em: string
  excluido_por: string | null
  origem_autor: OrigemAutor
  expira_em: string
  restaurado_em: string | null
}

export interface ExclusaoAgrupada {
  grupo: number
  titulo: string
  resumo: string
  tabelaRaiz: string
  contagens: Record<string, number>
  excluidoEm: string
  excluidoPor: string | null
  excluidoPorNome: string | null
  origemAutor: OrigemAutor
  expiraEm: string
  diasRestantes: number
  restaurada: boolean
}

const ROTULOS: Record<string, [string, string]> = {
  clientes: ['cliente', 'clientes'],
  clientes_fiscal: ['ficha do Fiscal', 'fichas do Fiscal'],
  clientes_contabil: ['ficha do Contábil', 'fichas do Contábil'],
  clientes_pessoal: ['ficha do Pessoal', 'fichas do Pessoal'],
  cliente_responsavel_historico: ['registro de responsável', 'registros de responsável'],
  tarefas: ['tarefa', 'tarefas'],
  tarefa_etapas: ['etapa de tarefa', 'etapas de tarefas'],
  tarefa_arquivos: ['anexo de tarefa', 'anexos de tarefas'],
  tarefas_avulsas: ['evento avulso', 'eventos avulsos'],
  evento_arquivos: ['anexo de evento', 'anexos de eventos'],
  client_files: ['arquivo do cliente', 'arquivos do cliente'],
  cliente_notas: ['nota', 'notas'],
  observacoes_clientes: ['observação', 'observações'],
  tarefa_grupos: ['grupo de tarefas', 'grupos de tarefas'],
  parcelamentos: ['parcelamento', 'parcelamentos'],
  financeiro_movimentos: ['movimento financeiro', 'movimentos financeiros'],
  procedimentos_societario: ['procedimento do Societário', 'procedimentos do Societário'],
  procedimento_arquivos: ['anexo de procedimento', 'anexos de procedimentos'],
}

// Quem "representa" a exclusão na lista (a primeira tabela presente vence).
const PRIORIDADE_RAIZ = [
  'clientes', 'parcelamentos', 'procedimentos_societario', 'financeiro_movimentos', 'tarefas_avulsas',
  'tarefas', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal', 'cliente_notas',
  'observacoes_clientes', 'tarefa_grupos', 'client_files', 'cliente_responsavel_historico',
  'tarefa_etapas', 'tarefa_arquivos', 'evento_arquivos', 'procedimento_arquivos',
]

function rotulo(tabela: string, n: number): string {
  const r = ROTULOS[tabela]
  if (!r) return tabela
  return n === 1 ? r[0] : r[1]
}

function ordenarPorPrioridade(tabelas: string[]): string[] {
  const pos = (t: string) => {
    const i = PRIORIDADE_RAIZ.indexOf(t)
    return i === -1 ? PRIORIDADE_RAIZ.length : i
  }
  return [...tabelas].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
}

export function textoResumo(contagens: Record<string, number>): string {
  return ordenarPorPrioridade(Object.keys(contagens))
    .map(t => `${contagens[t]} ${rotulo(t, contagens[t])}`)
    .join(', ')
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function tituloDaLinha(tabela: string, campos: Record<string, string>): string {
  const c = campos
  const partes = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ')
  switch (tabela) {
    case 'clientes':
      if (c.nome) return c.nome
      break
    case 'parcelamentos':
      if (c.empresa) return c.secao ? `${c.empresa} — ${c.secao}` : c.empresa
      break
    case 'tarefas':
      if (c.tipo) return c.mes && c.ano ? `${c.tipo} (${c.mes}/${c.ano})` : c.tipo
      break
    case 'tarefas_avulsas':
      if (c.titulo) return c.titulo
      break
    case 'financeiro_movimentos':
      if (c.natureza) return partes(capitalizar(c.natureza), c.valor ? `· R$ ${c.valor}` : undefined)
      break
    case 'procedimentos_societario':
      if (c.empresa) return c.empresa
      break
    case 'client_files':
    case 'tarefa_arquivos':
    case 'evento_arquivos':
    case 'procedimento_arquivos':
      if (c.name) return c.name
      break
    case 'tarefa_grupos':
    case 'tarefa_etapas':
      if (c.nome) return c.nome
      break
    case 'cliente_responsavel_historico':
      if (c.responsavel) return c.responsavel
      break
    case 'observacoes_clientes':
      if (c.mes && c.ano) return `Observação ${c.mes}/${c.ano}`
      break
    default:
      break
  }
  return ROTULOS[tabela] ? capitalizar(ROTULOS[tabela][0]) : tabela
}

export function diasAteExpirar(expiraEm: string, agora: Date): number {
  const ms = new Date(expiraEm).getTime() - agora.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

export function agruparExclusoes(
  linhas: LinhaLixeira[],
  agora: Date,
  nomesPorId: Record<string, string> = {},
): ExclusaoAgrupada[] {
  const porGrupo = new Map<number, LinhaLixeira[]>()
  for (const l of linhas) {
    const lista = porGrupo.get(l.grupo)
    if (lista) lista.push(l)
    else porGrupo.set(l.grupo, [l])
  }

  const resultado: ExclusaoAgrupada[] = []
  for (const [grupo, grupoLinhas] of porGrupo) {
    const contagens: Record<string, number> = {}
    for (const l of grupoLinhas) contagens[l.tabela] = (contagens[l.tabela] ?? 0) + 1

    const tabelaRaiz = ordenarPorPrioridade(Object.keys(contagens))[0]
    const linhaRaiz = grupoLinhas.find(l => l.tabela === tabelaRaiz) ?? grupoLinhas[0]
    const primeira = grupoLinhas[0]

    resultado.push({
      grupo,
      titulo: tituloDaLinha(tabelaRaiz, linhaRaiz.campos),
      resumo: textoResumo(contagens),
      tabelaRaiz,
      contagens,
      excluidoEm: primeira.excluido_em,
      excluidoPor: primeira.excluido_por,
      excluidoPorNome: primeira.excluido_por ? (nomesPorId[primeira.excluido_por] ?? null) : null,
      origemAutor: primeira.origem_autor,
      expiraEm: primeira.expira_em,
      diasRestantes: diasAteExpirar(primeira.expira_em, agora),
      restaurada: grupoLinhas.every(l => l.restaurado_em !== null),
    })
  }

  return resultado.sort(
    (a, b) => new Date(b.excluidoEm).getTime() - new Date(a.excluidoEm).getTime() || b.grupo - a.grupo,
  )
}
