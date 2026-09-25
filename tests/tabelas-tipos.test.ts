import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paraNumero, paraDataISO, detectarTipoColuna, opcoesDosValores } from '../lib/tabelas/tipos'

test('paraNumero: formatos brasileiros e simples', () => {
  assert.equal(paraNumero(12.5), 12.5)
  assert.equal(paraNumero('1.234,56'), 1234.56)
  assert.equal(paraNumero('R$ 10,00'), 10)
  assert.equal(paraNumero('12,5'), 12.5)
  assert.equal(paraNumero('1234.56'), 1234.56)
  assert.equal(paraNumero('-7'), -7)
})

test('paraNumero: o que não é número vira null', () => {
  assert.equal(paraNumero('abc'), null)
  assert.equal(paraNumero(''), null)
  assert.equal(paraNumero(null), null)
  assert.equal(paraNumero('12-34'), null)
})

test('paraDataISO: aceita AAAA-MM-DD e DD/MM/AAAA, rejeita datas impossíveis', () => {
  assert.equal(paraDataISO('2026-03-15'), '2026-03-15')
  assert.equal(paraDataISO('15/03/2026'), '2026-03-15')
  assert.equal(paraDataISO('5/3/2026'), '2026-03-05')
  assert.equal(paraDataISO('31/02/2026'), null)
  assert.equal(paraDataISO('texto'), null)
  assert.equal(paraDataISO(45000), null)
})

test('detectarTipoColuna: data, número, texto e vazio', () => {
  assert.equal(detectarTipoColuna(['2026-01-01', '15/02/2026', null]).tipo, 'data')
  assert.equal(detectarTipoColuna([1, '2,5', 3]).tipo, 'numero')
  assert.equal(detectarTipoColuna(['Empresa A', 'Empresa B', 'Empresa C']).tipo, 'texto')
  assert.equal(detectarTipoColuna([null, '', '  ']).tipo, 'texto')
})

test('detectarTipoColuna: poucos valores repetidos viram opções', () => {
  const r = detectarTipoColuna(['Pendente', 'Feito', 'Pendente', 'Feito', 'Pendente', 'Feito'])
  assert.equal(r.tipo, 'opcoes')
  assert.deepEqual(r.opcoes?.map(o => o.valor), ['Pendente', 'Feito'])
})

test('detectarTipoColuna: valores todos distintos não viram opções', () => {
  assert.equal(detectarTipoColuna(['a', 'b', 'c', 'd']).tipo, 'texto')
})

test('opcoesDosValores: únicos, sem vazios, com cor', () => {
  const o = opcoesDosValores(['A', ' B ', 'A', ''])
  assert.deepEqual(o.map(x => x.valor), ['A', 'B'])
  assert.ok(o.every(x => /^#[0-9a-f]{6}$/i.test(x.cor)))
})
