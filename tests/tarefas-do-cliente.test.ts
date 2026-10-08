import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tarefasRemovidasDoCliente, tiposSemUso } from '../lib/tarefas-do-cliente'

test('nome que saiu de personalizadas e não é mais esperado é removido', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(['Banco do Brasil', 'Caixa'], ['Caixa']), ['Banco do Brasil'])
})

test('nome que continua esperado (ex.: por atividade) não perde histórico', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(['ISS'], ['ISS']), [])
})

test('sem antes / duplicados', () => {
  assert.deepEqual(tarefasRemovidasDoCliente(null, ['A']), [])
  assert.deepEqual(tarefasRemovidasDoCliente(['A', 'A'], []), ['A'])
})

const tipo = (id: string, nome: string, extra: Partial<{ padrao: boolean; vigente_ate: string | null }> = {}) =>
  ({ id, nome, padrao: false, vigente_ate: null, ...extra })

test('tipo criado no cadastro do cliente que não sobrou em ninguém sai do catálogo', () => {
  assert.deepEqual(tiposSemUso([tipo('1', 'ENVIO GUIA')], [], []), ['1'])
})

test('tipo ainda usado por outro cliente fica no catálogo', () => {
  assert.deepEqual(tiposSemUso([tipo('1', 'ENVIO GUIA')], ['ENVIO GUIA'], []), [])
})

test('tipo com vínculo de atividade fica no catálogo', () => {
  assert.deepEqual(tiposSemUso([tipo('1', 'ENVIO GUIA')], [], ['1']), [])
})

test('tipo padrão ou encerrado (vigente_ate) nunca é apagado por aqui', () => {
  assert.deepEqual(tiposSemUso([tipo('1', 'A', { padrao: true }), tipo('2', 'B', { vigente_ate: '2026-09-01' })], [], []), [])
})
