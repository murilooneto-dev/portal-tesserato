import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mesesVisiveisDaPeriodicidade,
  periodicidadeDosMesesVisiveis,
  tarefaEsperadaNoPeriodo,
} from '../lib/tarefas-societario-periodicidade'

test('mesesVisiveisDaPeriodicidade: cada periodicidade cai nos meses certos, ancorada em Janeiro', () => {
  assert.equal(mesesVisiveisDaPeriodicidade('mensal'), null)
  assert.deepEqual(mesesVisiveisDaPeriodicidade('bimestral'), [1, 3, 5, 7, 9, 11])
  assert.deepEqual(mesesVisiveisDaPeriodicidade('trimestral'), [1, 4, 7, 10])
  assert.deepEqual(mesesVisiveisDaPeriodicidade('semestral'), [1, 7])
  assert.deepEqual(mesesVisiveisDaPeriodicidade('anual'), [1])
})

test('periodicidadeDosMesesVisiveis: é o inverso de mesesVisiveisDaPeriodicidade', () => {
  assert.equal(periodicidadeDosMesesVisiveis(null), 'mensal')
  assert.equal(periodicidadeDosMesesVisiveis([]), 'mensal')
  assert.equal(periodicidadeDosMesesVisiveis([1, 4, 7, 10]), 'trimestral')
  assert.equal(periodicidadeDosMesesVisiveis([10, 1, 7, 4]), 'trimestral') // ordem não importa
  assert.equal(periodicidadeDosMesesVisiveis([1, 7]), 'semestral')
  assert.equal(periodicidadeDosMesesVisiveis([2, 5, 8, 11]), 'mensal') // array desconhecido cai no default
})

test('tarefaEsperadaNoPeriodo: mensal aparece em qualquer mês a partir do vínculo', () => {
  const vinculo = { mesesVisiveis: null, vinculoCreatedAt: '2026-03-15T12:00:00Z' }
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 3, 2026), true) // mês da criação conta
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 5, 2026), true)
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 2, 2026), false) // mês anterior ao vínculo
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 12, 2025), false) // ano anterior
})

test('tarefaEsperadaNoPeriodo: trimestral só aparece nos meses âncora, respeitando não-retroatividade', () => {
  const vinculo = { mesesVisiveis: [1, 4, 7, 10], vinculoCreatedAt: '2026-02-10T12:00:00Z' }
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 1, 2026), false) // mês âncora, mas antes do vínculo
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 2, 2026), false) // mês do vínculo, mas não é âncora
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 4, 2026), true) // primeiro âncora após o vínculo
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 10, 2026), true)
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 1, 2027), true) // ano seguinte, mês âncora
})

test('tarefaEsperadaNoPeriodo: vínculo criado no ano seguinte nunca aparece no ano anterior', () => {
  const vinculo = { mesesVisiveis: [1], vinculoCreatedAt: '2027-01-05T12:00:00Z' }
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 1, 2026), false)
  assert.equal(tarefaEsperadaNoPeriodo(vinculo, 1, 2027), true)
})
