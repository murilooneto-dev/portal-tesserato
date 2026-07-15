import type { Cliente, ClienteContabil } from './types'

export const SELECT_CLIENTE_CONTABIL = '*, clientes_contabil!inner(*)'

export type ClienteComContabil = Cliente & ClienteContabil

export function flattenClienteContabil(row: Record<string, unknown>): ClienteComContabil {
  const { clientes_contabil, ...resto } = row as { clientes_contabil: ClienteContabil } & Record<string, unknown>
  return { ...resto, ...clientes_contabil } as ClienteComContabil
}
