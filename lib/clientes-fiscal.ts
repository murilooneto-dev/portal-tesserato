import type { Cliente, ClienteFiscal } from './types'

export const SELECT_CLIENTE_FISCAL = '*, clientes_fiscal!inner(*)'

export type ClienteComFiscal = Cliente & ClienteFiscal

export function flattenClienteFiscal(row: Record<string, unknown>): ClienteComFiscal {
  const { clientes_fiscal, ...resto } = row as { clientes_fiscal: ClienteFiscal } & Record<string, unknown>
  return { ...resto, ...clientes_fiscal } as ClienteComFiscal
}
