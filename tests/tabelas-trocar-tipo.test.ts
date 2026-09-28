import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepararTrocaTipo } from '../lib/tabelas/trocar-tipo'

test('texto para número: converte o que dá, mantém o que não dá', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: '10' },
      { id: 'b', valorAtual: '1.234,5' },
      { id: 'c', valorAtual: 'abc' },
      { id: 'd', valorAtual: null },
    ],
    'numero',
    null,
  )
  assert.equal(r.convertidas, 3)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: 10 },
    { id: 'b', valor: 1234.5 },
    { id: 'c', valor: 'abc' },
    { id: 'd', valor: null },
  ])
})

test('texto para data: DD/MM/AAAA converte, resto mantém o valor original', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: '15/03/2026' },
      { id: 'b', valorAtual: 'ontem' },
    ],
    'data',
    null,
  )
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: '2026-03-15' },
    { id: 'b', valor: 'ontem' },
  ])
})

test('número para texto: sempre converte, vira string', () => {
  const r = prepararTrocaTipo([{ id: 'a', valorAtual: 42 }], 'texto', null)
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.valores, [{ id: 'a', valor: '42' }])
})

test('qualquer tipo para opções: só bate se o valor já é uma das opções novas', () => {
  const opcoes = [{ valor: 'Feito', cor: '#10b981' }, { valor: 'Pendente', cor: '#f59e0b' }]
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: 'Feito' },
      { id: 'b', valorAtual: 'Cancelado' },
    ],
    'opcoes',
    opcoes,
  )
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: 'Feito' },
    { id: 'b', valor: 'Cancelado' },
  ])
})

test('célula vazia ou nula nunca conta como falha de conversão', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: null },
      { id: 'b', valorAtual: '' },
      { id: 'c', valorAtual: '   ' },
    ],
    'numero',
    null,
  )
  assert.equal(r.convertidas, 3)
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: null },
    { id: 'b', valor: null },
    { id: 'c', valor: null },
  ])
})

test('tabela vazia devolve zero em tudo', () => {
  const r = prepararTrocaTipo([], 'numero', null)
  assert.deepEqual(r, { convertidas: 0, naoConvertidas: 0, valores: [] })
})
