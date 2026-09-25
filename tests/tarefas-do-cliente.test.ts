import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tarefasRemovidasDoCliente } from '../lib/tarefas-do-cliente'

test('nome que saiu de personalizadas e não é mais esperado é removido', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(['Banco do Brasil', 'Caixa'], ['Caixa']), ['Banco do Brasil'])
})

test('nome que continua esperado (ex.: por atividade) não perde histórico', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(['ISS'], ['ISS']), [])
})

test('sem antes / duplicados', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(null, ['A']), [])
  assert.deepEqual(tarefasRemovidasDoCliente(['A', 'A'], []), ['A'])
})
