import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarNome, validarNomeEntidade, ordenarPorNome } from '../lib/config-entidades'

test('normalizarNome: remove acentos e caixa', () => {
  assert.equal(normalizarNome('  Lucro Presumido  '), 'LUCRO PRESUMIDO')
  assert.equal(normalizarNome('Isenção'), 'ISENCAO')
})

test('normalizarNome: strings já normalizadas ficam iguais só em maiúscula', () => {
  assert.equal(normalizarNome('MEI'), 'MEI')
})

test('validarNomeEntidade: rejeita nome vazio', () => {
  assert.equal(validarNomeEntidade(''), 'O nome não pode ficar vazio.')
  assert.equal(validarNomeEntidade('   '), 'O nome não pode ficar vazio.')
})

test('validarNomeEntidade: rejeita nome maior que 100 caracteres', () => {
  const longo = 'A'.repeat(101)
  assert.equal(validarNomeEntidade(longo), 'O nome não pode passar de 100 caracteres.')
})

test('validarNomeEntidade: aceita nome válido', () => {
  assert.equal(validarNomeEntidade('MEI Caminhoneiro'), null)
})

test('ordenarPorNome: ordena alfabeticamente em pt-BR (acentos não quebram a ordem)', () => {
  const itens = [{ nome: 'Simples' }, { nome: 'Água' }, { nome: 'MEI' }]
  assert.deepEqual(ordenarPorNome(itens).map(i => i.nome), ['Água', 'MEI', 'Simples'])
})
