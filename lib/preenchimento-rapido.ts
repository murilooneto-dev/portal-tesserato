// lib/preenchimento-rapido.ts
import type { MapaVinculosSetor } from './tarefas-esperadas'

export type CampoFiltro = 'grupo' | 'regime' | 'atividade'

export interface ClienteFiltro {
  id: string
  nome: string
  grupo?: string | null
  regime?: string | null
  atividade?: string[] | null
}

export interface TarefaTipoRaw {
  nome: string
  tipo_resposta: string
  etapas: string[] | null
}

// Só tarefas tipo_resposta='data' sem etapas nomeadas viram um checkbox de
// um clique só na grade de preenchimento em lote — mesmo critério que
// TarefaChecklist.tsx usa pra decidir entre checkbox simples e etapas
// (tarefa com etapas continua só editável na ficha do cliente).
export function nomesTarefaTipoData(tipos: TarefaTipoRaw[]): string[] {
  return tipos
    .filter(t => t.tipo_resposta === 'data' && (!t.etapas || t.etapas.length === 0))
    .map(t => t.nome)
}

export function valoresDistintos(clientes: ClienteFiltro[], campo: CampoFiltro): string[] {
  const valores = new Set<string>()
  for (const c of clientes) {
    if (campo === 'atividade') {
      for (const v of c.atividade ?? []) valores.add(v)
      continue
    }
    const v = c[campo]
    if (v) valores.add(v)
  }
  return Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function clientesPorValor(
  clientes: ClienteFiltro[],
  campo: CampoFiltro,
  valor: string,
): ClienteFiltro[] {
  if (campo === 'atividade') {
    return clientes.filter(c => (c.atividade ?? []).includes(valor))
  }
  return clientes.filter(c => c[campo] === valor)
}

const CHAVE_MAPA: Record<CampoFiltro, keyof MapaVinculosSetor> = {
  grupo: 'porGrupo',
  regime: 'porRegime',
  atividade: 'porAtividade',
}

export function tarefasTipoDataVinculadas(
  mapa: MapaVinculosSetor,
  campo: CampoFiltro,
  valor: string,
  tiposData: Set<string>,
): string[] {
  const nomes = mapa[CHAVE_MAPA[campo]][valor] ?? []
  const filtradas = new Set(nomes.filter(n => tiposData.has(n)))
  return Array.from(filtradas).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
