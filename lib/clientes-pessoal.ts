import type { Cliente, ClientePessoal } from './types'

export const SELECT_CLIENTE_PESSOAL = '*, clientes_pessoal!inner(*)'

export type ClienteComPessoal = Cliente & ClientePessoal

export function flattenClientePessoal(row: Record<string, unknown>): ClienteComPessoal {
  const { clientes_pessoal, ...resto } = row as { clientes_pessoal: ClientePessoal } & Record<string, unknown>
  return { ...resto, ...clientes_pessoal } as ClienteComPessoal
}
