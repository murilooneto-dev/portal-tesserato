import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketDoRegime } from '../lib/regime-bucket'

test('bucketDoRegime: reconhece variações de Simples', () => {
  assert.equal(bucketDoRegime('Simples'), 'simples')
  assert.equal(bucketDoRegime('Simples Nacional'), 'simples')
  assert.equal(bucketDoRegime('Simples / EPP'), 'simples')
})

test('bucketDoRegime: reconhece variações de MEI', () => {
  assert.equal(bucketDoRegime('MEI'), 'mei')
  assert.equal(bucketDoRegime('MEI caminhoneiro'), 'mei')
})

test('bucketDoRegime: reconhece variações de Isento', () => {
  assert.equal(bucketDoRegime('Isenta'), 'isento')
  assert.equal(bucketDoRegime('Isento'), 'isento')
})

test('bucketDoRegime: Presumido, Real e Normal caem em "normal"', () => {
  assert.equal(bucketDoRegime('Presumido'), 'normal')
  assert.equal(bucketDoRegime('Presumido / EPP'), 'normal')
  assert.equal(bucketDoRegime('Lucro Real'), 'normal')
  assert.equal(bucketDoRegime('Regime Normal'), 'normal')
})

test('bucketDoRegime: vazio/nulo cai em "normal" (mesmo default de sempre)', () => {
  assert.equal(bucketDoRegime(null), 'normal')
  assert.equal(bucketDoRegime(undefined), 'normal')
  assert.equal(bucketDoRegime(''), 'normal')
})

test('bucketDoRegime: não é sensível a maiúsculas/minúsculas', () => {
  assert.equal(bucketDoRegime('SIMPLES NACIONAL'), 'simples')
  assert.equal(bucketDoRegime('mei'), 'mei')
})
