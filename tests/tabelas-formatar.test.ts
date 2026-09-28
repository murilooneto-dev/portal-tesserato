import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarValor } from '../lib/tabelas/formatar'

test('data ISO vira DD/MM/AAAA', () => {
  assert.equal(formatarValor('data', '2026-03-15'), '15/03/2026')
})

test('data que não é ISO aparece como veio', () => {
  assert.equal(formatarValor('data', 'ontem'), 'ontem')
})

test('número usa formato brasileiro; texto de número não convertido aparece como veio', () => {
  assert.equal(formatarValor('numero', 1234.5), '1.234,5')
  assert.equal(formatarValor('numero', 'abc'), 'abc')
})

test('vazio vira traço', () => {
  assert.equal(formatarValor('texto', null), '—')
  assert.equal(formatarValor('texto', ''), '—')
})

test('texto, opções e cliente passam como estão', () => {
  assert.equal(formatarValor('texto', 'oi'), 'oi')
  assert.equal(formatarValor('opcoes', 'Ok'), 'Ok')
  assert.equal(formatarValor('cliente', 'Empresa A'), 'Empresa A')
})
