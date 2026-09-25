import { test } from 'node:test'
import assert from 'node:assert/strict'
import { converterEntradaCelula, ehUuid, MAX_TEXTO_CELULA } from '../lib/tabelas/editar-celula'

const OPCOES = [{ valor: 'Pendente', cor: '#f59e0b' }, { valor: 'Feito', cor: '#10b981' }]

test('ehUuid aceita uuid e rejeita o resto', () => {
  assert.equal(ehUuid('11111111-1111-4111-8111-111111111111'), true)
  assert.equal(ehUuid('abc'), false)
  assert.equal(ehUuid(null), false)
  assert.equal(ehUuid(42), false)
})

test('vazio, espaços e null viram null em qualquer tipo editável', () => {
  for (const tipo of ['texto', 'numero', 'data', 'opcoes'] as const) {
    assert.deepEqual(converterEntradaCelula(tipo, '', OPCOES), { ok: true, valor: null })
    assert.deepEqual(converterEntradaCelula(tipo, '   ', OPCOES), { ok: true, valor: null })
    assert.deepEqual(converterEntradaCelula(tipo, null, OPCOES), { ok: true, valor: null })
  }
})

test('texto é aparado e tem limite', () => {
  assert.deepEqual(converterEntradaCelula('texto', '  oi  ', null), { ok: true, valor: 'oi' })
  const r = converterEntradaCelula('texto', 'x'.repeat(MAX_TEXTO_CELULA + 1), null)
  assert.equal(r.ok, false)
})

test('número aceita formato brasileiro e recusa lixo', () => {
  assert.deepEqual(converterEntradaCelula('numero', '1.234,56', null), { ok: true, valor: 1234.56 })
  assert.deepEqual(converterEntradaCelula('numero', '12,5', null), { ok: true, valor: 12.5 })
  assert.deepEqual(converterEntradaCelula('numero', 7, null), { ok: true, valor: 7 })
  const r = converterEntradaCelula('numero', 'abc', null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /número/i)
})

test('data aceita AAAA-MM-DD e DD/MM/AAAA e recusa datas impossíveis', () => {
  assert.deepEqual(converterEntradaCelula('data', '2026-03-15', null), { ok: true, valor: '2026-03-15' })
  assert.deepEqual(converterEntradaCelula('data', '15/03/2026', null), { ok: true, valor: '2026-03-15' })
  const r = converterEntradaCelula('data', '31/02/2026', null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /data/i)
})

test('opções só aceita valores da lista', () => {
  assert.deepEqual(converterEntradaCelula('opcoes', 'Feito', OPCOES), { ok: true, valor: 'Feito' })
  const r = converterEntradaCelula('opcoes', 'Inventado', OPCOES)
  assert.equal(r.ok, false)
  assert.equal(converterEntradaCelula('opcoes', 'Feito', null).ok, false)
})

test('cliente nunca é editado como texto', () => {
  const r = converterEntradaCelula('cliente', 'Empresa A', null)
  assert.equal(r.ok, false)
})

test('tipo de entrada inesperado (objeto, booleano) é recusado', () => {
  assert.equal(converterEntradaCelula('texto', { a: 1 }, null).ok, false)
  assert.equal(converterEntradaCelula('texto', true, null).ok, false)
})
