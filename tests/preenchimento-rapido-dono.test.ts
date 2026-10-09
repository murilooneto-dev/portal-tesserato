import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoVisivelNoCliente, tiposOcultosNoCliente } from '../lib/tarefa-tipo-visibilidade'

const EU = 'u-eu'
const OUTRO = 'u-outro'

test('tipo sem dono aparece', () => {
  assert.equal(tipoVisivelNoCliente(null, undefined, 'MEI', EU, 'user'), true)
})

test('dono é o próprio usuário: aparece', () => {
  assert.equal(tipoVisivelNoCliente(EU, ['MEI'], 'Lucro Real', EU, 'user'), true)
})

test('dono é outro e atende o regime: some', () => {
  assert.equal(tipoVisivelNoCliente(OUTRO, ['MEI'], 'mei', EU, 'user'), false)
  assert.equal(tipoVisivelNoCliente(OUTRO, undefined, 'MEI', EU, 'user'), false)
})

test('dono é outro e não atende o regime: aparece', () => {
  assert.equal(tipoVisivelNoCliente(OUTRO, ['MEI'], 'Lucro Real', EU, 'user'), true)
})

test('cliente sem regime e dono com regimes marcados: aparece', () => {
  assert.equal(tipoVisivelNoCliente(OUTRO, ['MEI'], null, EU, 'user'), true)
})

test('admin vê sempre', () => {
  assert.equal(tipoVisivelNoCliente(OUTRO, ['MEI'], 'MEI', EU, 'admin'), true)
})

test('tiposOcultosNoCliente lista só os que somem para o usuário naquele cliente', () => {
  const donos = { A: OUTRO, B: OUTRO, C: EU }
  const regimes = { A: ['MEI'], B: ['Lucro Real'] }
  assert.deepEqual(tiposOcultosNoCliente(donos, regimes, 'MEI', EU, 'user'), ['A'])
  assert.deepEqual(tiposOcultosNoCliente(donos, regimes, 'MEI', EU, 'admin'), [])
})
