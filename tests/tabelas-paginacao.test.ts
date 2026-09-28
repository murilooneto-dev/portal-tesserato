import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginar, POR_PAGINA } from '../lib/tabelas/paginacao'

test('POR_PAGINA é 100', () => {
  assert.equal(POR_PAGINA, 100)
})

test('primeira página de 250 linhas', () => {
  assert.deepEqual(paginar('1', 250), { pagina: 1, totalPaginas: 3, de: 0, ate: 99 })
})

test('última página parcial', () => {
  assert.deepEqual(paginar('3', 250), { pagina: 3, totalPaginas: 3, de: 200, ate: 299 })
})

test('página acima do total é limitada à última', () => {
  assert.equal(paginar('999', 250).pagina, 3)
  assert.equal(paginar('999999', 250).pagina, 3)
})

test('página inválida (0, negativa, texto, ausente) vira 1', () => {
  assert.equal(paginar('0', 250).pagina, 1)
  assert.equal(paginar('-2', 250).pagina, 1)
  assert.equal(paginar('abc', 250).pagina, 1)
  assert.equal(paginar(undefined, 250).pagina, 1)
})

test('tabela vazia tem 1 página', () => {
  assert.deepEqual(paginar('1', 0), { pagina: 1, totalPaginas: 1, de: 0, ate: 99 })
})

test('porPagina customizado', () => {
  assert.deepEqual(paginar('2', 25, 10), { pagina: 2, totalPaginas: 3, de: 10, ate: 19 })
})
