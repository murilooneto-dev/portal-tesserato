// lib/preenchimento-rapido.ts
import type { MapaVinculosSetor } from './tarefas-esperadas'

export type CampoFiltro = 'regime' | 'atividade'

export interface ClienteFiltro {
  id: string
  nome: string
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

export function tarefasTipoDataVinculadas(
  mapa: MapaVinculosSetor,
  campo: CampoFiltro,
  valor: string,
  tiposData: Set<string>,
): string[] {
  // porAtividade guarda { tarefa, regimeNome } (suporte a vínculo
  // atividade+regime, ver lib/tarefas-esperadas.ts) — aqui não filtramos
  // por regime, mesmo comportamento de sempre desta tela (agrupa por
  // atividade/regime do cliente, nunca foi regime-consciente pro
  // caso de vínculo de atividade).
  const nomes = campo === 'atividade'
    ? (mapa.porAtividade[valor] ?? []).map(e => e.tarefa)
    : (mapa.porRegime[valor] ?? [])
  const filtradas = new Set(nomes.filter(n => tiposData.has(n)))
  return Array.from(filtradas).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
