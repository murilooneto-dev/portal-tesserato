import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeEditarLinhas } from '../lib/tabelas/permissoes'

test('admin edita qualquer setor', () => {
  assert.equal(podeEditarLinhas({ role: 'admin', setores: [] }, 'fiscal'), true)
})

test('usuário do setor edita', () => {
  assert.equal(podeEditarLinhas({ role: 'operador', setores: ['fiscal', 'pessoal'] }, 'pessoal'), true)
})

test('usuário de outro setor não edita', () => {
  assert.equal(podeEditarLinhas({ role: 'operador', setores: ['fiscal'] }, 'financeiro'), false)
})

test('perfil ausente ou sem setores nunca edita', () => {
  assert.equal(podeEditarLinhas(null, 'fiscal'), false)
  assert.equal(podeEditarLinhas(undefined, 'fiscal'), false)
  assert.equal(podeEditarLinhas({ role: 'operador', setores: null }, 'fiscal'), false)
})
