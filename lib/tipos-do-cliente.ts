// Tarefa personalizada de um cliente do Contábil (tarefa_tipos.cliente_id,
// migration 070): criada e apagada junto com o salvar do cadastro dele.
import type { TipoResposta } from './types'
import type { PeriodoTarefas } from './tarefas-esperadas'
import { tarefasRemovidasDoCliente } from './tarefas-do-cliente'

// O que o NovoTipoTarefaModal (modo adiar) devolve: o tipo só é gravado quando
// o cadastro do cliente é salvo.
export interface NovoTipoConfig {
  tipoResposta: TipoResposta
  etapas: string[] | null
  mesesVisiveis: number[] | null
  inicioEm: PeriodoTarefas | null
}

// Nomes que perdem o histórico e o tipo do cliente ao salvar: os que saíram da
// ficha (tarefasRemovidasDoCliente) mais os recriados (nome de tiposNovos que
// já estava na ficha: o tipo e as linhas antigas saem, o novo entra limpo).
export function nomesParaApagar(
  personalizadasAntes: string[],
  esperadasDepois: string[],
  tiposNovos: string[],
): string[] {
  const antes = new Set(personalizadasAntes)
  const recriados = tiposNovos.filter(n => antes.has(n))
  return Array.from(new Set([...tarefasRemovidasDoCliente(personalizadasAntes, esperadasDepois), ...recriados]))
}

// A server action é um endpoint público: o que vem de tiposNovos é revalidado.
// Descarta (com erro) nome vazio ou com espaço nas pontas, formato fora de
// data/texto/checklist e checklist sem etapas; no Contábil não há meses visíveis.
export function validarTiposNovos(
  tiposNovos: Record<string, NovoTipoConfig>,
): { tipos: Record<string, NovoTipoConfig>; error?: string } {
  const tipos: Record<string, NovoTipoConfig> = {}
  for (const [nome, cfg] of Object.entries(tiposNovos ?? {})) {
    if (!nome || nome !== nome.trim()) return { tipos: {}, error: `Nome de tarefa inválido: "${nome}".` }
    if (!cfg || !['data', 'texto', 'checklist'].includes(cfg.tipoResposta)) {
      return { tipos: {}, error: `Formato inválido para a tarefa "${nome}".` }
    }
    let etapas: string[] | null = null
    if (cfg.etapas != null) {
      if (!Array.isArray(cfg.etapas)) return { tipos: {}, error: `Etapas inválidas na tarefa "${nome}".` }
      etapas = cfg.etapas.map(e => (typeof e === 'string' ? e.trim() : '')).filter(Boolean)
      if (etapas.length !== cfg.etapas.length || etapas.length === 0) {
        return { tipos: {}, error: `Etapas inválidas na tarefa "${nome}".` }
      }
    }
    if (cfg.tipoResposta === 'checklist' && !etapas) {
      return { tipos: {}, error: `A tarefa "${nome}" precisa de ao menos uma etapa.` }
    }
    tipos[nome] = { tipoResposta: cfg.tipoResposta, etapas, mesesVisiveis: null, inicioEm: cfg.inicioEm ?? null }
  }
  return { tipos }
}
