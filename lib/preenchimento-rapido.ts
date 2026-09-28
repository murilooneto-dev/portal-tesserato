// lib/preenchimento-rapido.ts
import { calcularTarefasEsperadas, type MapaVinculosSetor } from './tarefas-esperadas'

export type CampoFiltro = 'regime' | 'atividade'

export interface ClienteFiltro {
  id: string
  nome: string
  regime?: string | null
  atividade?: string[] | null
  tarefas_personalizadas?: string[]
  tarefas_excluidas?: string[]
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

// Nomes do catálogo que exigem edição na ficha do cliente (etapas, texto
// livre ou checklist) e por isso nunca viram checkbox simples aqui — mesmo
// que também estejam em tarefas_personalizadas de algum cliente. Complemento
// de nomesTarefaTipoData: uma tarefa personalizada com nome que não aparece
// em nenhum dos dois (não está no catálogo) é tratada como DATA por padrão,
// mesmo critério que a ficha do cliente já usa pra tipo não cadastrado.
export function nomesTarefaTipoNaoData(tipos: TarefaTipoRaw[]): string[] {
  return tipos
    .filter(t => t.tipo_resposta !== 'data' || (t.etapas && t.etapas.length > 0))
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

// Tarefas tipo DATA que de fato se aplicam a esse cliente — mesma conta de
// calcularTarefasEsperadas (vínculo automático atividade+regime menos
// tarefas_excluidas, mais tarefas_personalizadas), restrita ao conjunto de
// tarefas tipo DATA sem etapas (as únicas que viram checkbox nesta tela).
// Uma tarefa personalizada cujo nome não existe no catálogo (nem em
// tiposData nem em tiposNaoData) entra do mesmo jeito — é o caso de
// personalizadas que nunca ganharam entrada em tarefa_tipos e por isso
// sumiam da grade; a ficha do cliente já trata esse mesmo caso como DATA
// por padrão, então aqui vira checkbox igual.
export function tarefasAplicaveisCliente(
  cliente: ClienteFiltro,
  mapa: MapaVinculosSetor,
  tiposData: Set<string>,
  tiposNaoData: Set<string> = new Set(),
): Set<string> {
  const esperadas = calcularTarefasEsperadas(
    { ...cliente, tarefas_personalizadas: cliente.tarefas_personalizadas ?? [] },
    mapa,
  )
  const personalizadas = new Set(cliente.tarefas_personalizadas ?? [])
  return new Set(
    esperadas.filter(t => tiposData.has(t) || (personalizadas.has(t) && !tiposNaoData.has(t))),
  )
}

// União das tarefas aplicáveis de todo um grupo de clientes — usada pra
// montar os botões de tarefa disponíveis (catálogo automático +
// personalizadas de qualquer cliente do grupo).
export function tarefasDisponiveisParaClientes(
  clientes: ClienteFiltro[],
  mapa: MapaVinculosSetor,
  tiposData: Set<string>,
  tiposNaoData: Set<string> = new Set(),
): string[] {
  const nomes = new Set<string>()
  for (const c of clientes) {
    for (const t of tarefasAplicaveisCliente(c, mapa, tiposData, tiposNaoData)) nomes.add(t)
  }
  return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// Linhas (clientes) que devem aparecer na grade pras colunas selecionadas:
// precisa ter pelo menos uma delas realmente aplicável. Com
// apenasPendentes=true, exige além disso que pelo menos uma dessas
// aplicáveis ainda não esteja concluída — cliente com todas as colunas já
// marcadas simplesmente some da lista, mesmo que a tarefa continue
// aplicável a ele.
export function linhasVisiveis(
  clientes: ClienteFiltro[],
  colunas: string[],
  tarefasAplicaveisPorCliente: Record<string, Set<string>>,
  concluida: (clienteId: string, tipo: string) => boolean,
  apenasPendentes: boolean,
): ClienteFiltro[] {
  return clientes.filter(c => {
    const aplicaveis = colunas.filter(tipo => tarefasAplicaveisPorCliente[c.id]?.has(tipo))
    if (aplicaveis.length === 0) return false
    if (!apenasPendentes) return true
    return aplicaveis.some(tipo => !concluida(c.id, tipo))
  })
}
