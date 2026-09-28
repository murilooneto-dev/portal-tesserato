import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setorValido } from '../lib/tarefa-grupos-actions'

test('setorValido aceita só os 5 setores reais', () => {
  assert.equal(setorValido('fiscal'), true)
  assert.equal(setorValido('contabil'), true)
  assert.equal(setorValido('societario'), true)
})

test('setorValido recusa chave de protótipo do JS e qualquer outra string', () => {
  assert.equal(setorValido('constructor'), false)
  assert.equal(setorValido('__proto__'), false)
  assert.equal(setorValido('toString'), false)
  assert.equal(setorValido('hasOwnProperty'), false)
  assert.equal(setorValido(''), false)
  assert.equal(setorValido('FISCAL'), false)
})
