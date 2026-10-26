import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomesParaApagar } from '../lib/tipos-do-cliente'

test('nomesParaApagar: removida da ficha', () => {
  assert.deepEqual(nomesParaApagar(['A', 'B'], ['A'], []), ['B'])
})
test('nomesParaApagar: recriada entra na lista', () => {
  assert.deepEqual(nomesParaApagar(['A'], ['A'], ['A']), ['A'])
})
test('nomesParaApagar: tipo novo que não existia não apaga nada', () => {
  assert.deepEqual(nomesParaApagar([], ['N'], ['N']), [])
})
