import { test } from 'node:test'
import assert from 'node:assert/strict'
import { empresaDesabilitada, empresaTemSetorDesabilitavel } from '../lib/cliente-ativo'

test('sem nenhum setor: não é desabilitada nem desabilitável', () => {
  assert.equal(empresaDesabilitada([null, null, undefined]), false)
  assert.equal(empresaTemSetorDesabilitavel([null, null]), false)
})

test('todos os setores existentes inativos: desabilitada', () => {
  assert.equal(empresaDesabilitada([{ ativo: false }, null, { ativo: false }]), true)
})

test('algum setor ativo: não desabilitada', () => {
  assert.equal(empresaDesabilitada([{ ativo: false }, { ativo: true }]), false)
})
