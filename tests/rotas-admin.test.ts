// tests/rotas-admin.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehRotaAdmin } from '../lib/rotas-admin'

test('ehRotaAdmin: /admin/lixeira e subrotas exigem admin', () => {
  assert.equal(ehRotaAdmin('/admin/lixeira'), true)
  assert.equal(ehRotaAdmin('/admin/lixeira/qualquer'), true)
})

test('ehRotaAdmin: rotas admin que já existiam continuam exigindo admin', () => {
  assert.equal(ehRotaAdmin('/fiscal/parametros'), true)
  assert.equal(ehRotaAdmin('/vinculos'), true)
})

test('ehRotaAdmin: /admin/configuracoes continua fora (controlada por paginas_acesso)', () => {
  assert.equal(ehRotaAdmin('/admin/configuracoes'), false)
  assert.equal(ehRotaAdmin('/admin/configuracoes/fiscal'), false)
})

test('ehRotaAdmin: prefixo parecido não conta (lixeiras, lixeira-x)', () => {
  assert.equal(ehRotaAdmin('/admin/lixeiras'), false)
  assert.equal(ehRotaAdmin('/admin/lixeira-x'), false)
})
