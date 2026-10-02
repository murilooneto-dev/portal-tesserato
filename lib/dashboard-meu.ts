// Modo "Meu" do Dashboard do Fiscal: só filtra o que o Dashboard do setor já
// calculou (tipos do progresso, tarefas do mês, donos dos tipos). Nenhuma
// consulta nova e nenhum número do setor muda.

import { normalizarNome } from './tarefa-tipo-visibilidade'

export type VisaoDashboard = 'setor' | 'meu'

// `?visao=meu` liga o modo Meu; qualquer outra coisa (ou nada) é o setor.
export function visaoDaUrl(valor: string | string[] | undefined): VisaoDashboard {
  return valor === 'meu' ? 'meu' : 'setor'
}

// Mesma comparação do resto do Fiscal (tarefa-tipo-visibilidade): trim e
// minúsculas, sem tirar acento; vazio nunca é igual a nada. Assim "Meu" e a %
// do cliente concordam.
export function mesmoResponsavel(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNome(a)
  return na !== '' && na === normalizarNome(b)
}

interface ClienteMin { id: string; responsavel: string | null }
interface TarefaMin { cliente_id: string; tipo: string; concluida: boolean }

export interface EntradaMeu<C extends ClienteMin, T extends TarefaMin> {
  clientes: C[]
  nomeUsuario: string | null | undefined
  tarefas: T[]
  /** Tipos que contam na % de cada cliente (já sem os encaminhados a outros). */
  tiposDoProgresso: Record<string, Set<string>>
  /** Tipos esperados de cada cliente, antes de tirar os encaminhados. */
  tiposBrutos: Record<string, Set<string>>
  donoNomePorTipo: Record<string, string | null | undefined>
}

export interface PendenciaMeu<C> { cliente: C; tipos: string[] }
export interface EncaminhadaMeu<C> { cliente: C; tipo: string; concluida: boolean }

export function calcularMeu<C extends ClienteMin, T extends TarefaMin>(e: EntradaMeu<C, T>) {
  const clientes = e.clientes.filter(c => mesmoResponsavel(c.responsavel, e.nomeUsuario))
  const ids = new Set(clientes.map(c => c.id))
  const tarefas = e.tarefas.filter(t => ids.has(t.cliente_id))

  const feitas = new Set(e.tarefas.filter(t => t.concluida).map(t => `${t.cliente_id}|${t.tipo}`))
  const feita = (clienteId: string, tipo: string) => feitas.has(`${clienteId}|${tipo}`)

  let total = 0
  let concluidas = 0
  const pendentes = new Map<string, string[]>()
  for (const c of clientes) {
    const tipos = Array.from(e.tiposDoProgresso[c.id] ?? []).sort((a, b) => a.localeCompare(b))
    total += tipos.length
    for (const tipo of tipos) {
      if (feita(c.id, tipo)) concluidas++
      else pendentes.set(c.id, [...(pendentes.get(c.id) ?? []), tipo])
    }
  }

  // Tipos encaminhados ao usuário em clientes que não são dele.
  const encaminhadas: EncaminhadaMeu<C>[] = []
  for (const c of e.clientes) {
    if (ids.has(c.id)) continue
    const tipos = Array.from(e.tiposBrutos[c.id] ?? [])
      .filter(tipo => mesmoResponsavel(e.donoNomePorTipo[tipo], e.nomeUsuario))
      .sort((a, b) => a.localeCompare(b))
    for (const tipo of tipos) {
      const concluida = feita(c.id, tipo)
      encaminhadas.push({ cliente: c, tipo, concluida })
      if (!concluida) pendentes.set(c.id, [...(pendentes.get(c.id) ?? []), tipo])
    }
  }

  const pendencias: PendenciaMeu<C>[] = e.clientes
    .filter(c => pendentes.has(c.id))
    .map(c => ({ cliente: c, tipos: pendentes.get(c.id)! }))

  return { clientes, tarefas, total, concluidas, encaminhadas, pendencias }
}
