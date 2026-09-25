import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoContaNoProgressoDoCliente, filtrarTiposDoProgresso } from '../lib/tarefa-tipo-visibilidade'

test('tipo sem dono sempre conta', () => {
  assert.equal(tipoContaNoProgressoDoCliente(null, 'Ana'), true)
  assert.equal(tipoContaNoProgressoDoCliente(undefined, null), true)
})

test('dono igual ao responsável do cliente conta (case/espaços ignorados)', () => {
  assert.equal(tipoContaNoProgressoDoCliente('Ana ', 'ana'), true)
})

test('dono diferente do responsável não conta', () => {
  assert.equal(tipoContaNoProgressoDoCliente('Bia', 'Ana'), false)
})

test('cliente sem responsável: tipo com dono fica fora', () => {
  assert.equal(tipoContaNoProgressoDoCliente('Bia', null), false)
})

test('filtrarTiposDoProgresso mantém só os que contam', () => {
  assert.deepEqual(
    filtrarTiposDoProgresso(['A', 'B', 'C'], 'Ana', { B: 'Bia', C: 'ana' }),
    ['A', 'C'],
  )
})
