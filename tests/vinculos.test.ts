// tests/vinculos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarStatusVinculo, formatarBadgeVinculo, calcularNovosPares, montarTiposPorSetor, resumoNovosVinculos } from '../lib/vinculos'
import type { TarefaVinculo } from '../lib/types'

test('agregarStatusVinculo: uma origem concluída libera (total=1)', () => {
  const status = agregarStatusVinculo([{ setorOrigemLabel: 'Fiscal', concluida: true }])
  assert.deepEqual(status, { setorOrigemLabel: 'Fiscal', liberada: true, concluidos: 1, total: 1 })
})

test('agregarStatusVinculo: uma origem não concluída não libera (total=1)', () => {
  const status = agregarStatusVinculo([{ setorOrigemLabel: 'Fiscal', concluida: false }])
  assert.deepEqual(status, { setorOrigemLabel: 'Fiscal', liberada: false, concluidos: 0, total: 1 })
})

test('agregarStatusVinculo: duas origens, só uma concluída = não libera (E lógico)', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: false },
  ])
  assert.equal(status.liberada, false)
  assert.equal(status.concluidos, 1)
  assert.equal(status.total, 2)
})

test('agregarStatusVinculo: duas origens, ambas concluídas = libera', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: true },
  ])
  assert.equal(status.liberada, true)
  assert.equal(status.concluidos, 2)
  assert.equal(status.total, 2)
})

test('agregarStatusVinculo: setorOrigemLabel guarda o label da primeira origem da lista', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: true },
  ])
  assert.equal(status.setorOrigemLabel, 'Fiscal')
})

test('formatarBadgeVinculo: total=1 liberada mantém o texto atual com o setor', () => {
  const badge = formatarBadgeVinculo({ liberada: true, concluidos: 1, total: 1, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '✓ Liberada por Fiscal')
  assert.equal(badge.classe, 'bg-green-500/15 text-green-400')
})

test('formatarBadgeVinculo: total=1 aguardando mantém o texto atual com o setor', () => {
  const badge = formatarBadgeVinculo({ liberada: false, concluidos: 0, total: 1, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '⏳ Aguardando Fiscal')
  assert.equal(badge.classe, 'bg-orange-500/15 text-orange-400')
})

test('formatarBadgeVinculo: total>1 liberada usa contagem, sem nomear setor', () => {
  const badge = formatarBadgeVinculo({ liberada: true, concluidos: 3, total: 3, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '✓ Liberada (3/3)')
})

test('formatarBadgeVinculo: total>1 aguardando usa contagem parcial', () => {
  const badge = formatarBadgeVinculo({ liberada: false, concluidos: 2, total: 3, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '⏳ Aguardando (2/3 concluídas)')
})

const catalogoExistente: TarefaVinculo[] = [
  { id: '1', setor_origem: 'fiscal', tipo_origem: 'DAS', setor_destino: 'contabil', tipo_destino: 'Guia', created_at: '' },
]

test('calcularNovosPares: gera o produto cartesiano entre origens e destinos marcados', () => {
  const pares = calcularNovosPares('fiscal', ['A', 'B'], 'contabil', ['X'], [])
  assert.deepEqual(pares, [
    { tipoOrigem: 'A', tipoDestino: 'X' },
    { tipoOrigem: 'B', tipoDestino: 'X' },
  ])
})

test('calcularNovosPares: pula pares que já existem no catálogo pro mesmo par de setores', () => {
  const pares = calcularNovosPares('fiscal', ['DAS', 'ISS'], 'contabil', ['Guia'], catalogoExistente)
  assert.deepEqual(pares, [{ tipoOrigem: 'ISS', tipoDestino: 'Guia' }])
})

test('calcularNovosPares: não deduplica contra vínculo de outro par de setores com mesmo texto', () => {
  const pares = calcularNovosPares('pessoal', ['DAS'], 'contabil', ['Guia'], catalogoExistente)
  assert.deepEqual(pares, [{ tipoOrigem: 'DAS', tipoDestino: 'Guia' }])
})

test('montarTiposPorSetor: tarefa do catálogo aparece mesmo sem nenhum cliente usando', () => {
  const r = montarTiposPorSetor(
    [{ setor: 'fiscal', nome: 'CONFERÊNCIA ENTRADAS' }, { setor: 'societario', nome: 'ALTERAÇÃO' }],
    { fiscal: [], contabil: [], pessoal: [] },
  )
  assert.deepEqual(r.fiscal, ['CONFERÊNCIA ENTRADAS'])
  assert.deepEqual(r.societario, ['ALTERAÇÃO'])
  assert.deepEqual(r.financeiro, [])
})

test('montarTiposPorSetor: une catálogo com nomes usados por clientes, sem duplicar e ordenado', () => {
  const r = montarTiposPorSetor(
    [{ setor: 'fiscal', nome: 'B' }, { setor: 'fiscal', nome: 'A' }],
    { fiscal: ['B', 'ENTRADA'], contabil: ['X'], pessoal: [] },
  )
  assert.deepEqual(r.fiscal, ['A', 'B', 'ENTRADA'])
  assert.deepEqual(r.contabil, ['X'])
})

test('resumo do novo vínculo: nada marcado, um, vários e já existentes', () => {
  assert.equal(resumoNovosVinculos('fiscal', [], 'contabil', ['B'], []), 'Marque ao menos uma tarefa de cada lado.')
  assert.equal(resumoNovosVinculos('fiscal', ['DAS'], 'contabil', ['Envio de Documentos'], [{ tipoOrigem: 'DAS', tipoDestino: 'Envio de Documentos' }]),
    'Será criado 1 vínculo: DAS (Fiscal) libera Envio de Documentos (Contábil).')
  assert.equal(resumoNovosVinculos('fiscal', ['A', 'B'], 'contabil', ['C', 'D'], [
    { tipoOrigem: 'A', tipoDestino: 'C' }, { tipoOrigem: 'A', tipoDestino: 'D' }, { tipoOrigem: 'B', tipoDestino: 'C' },
  ]), 'Serão criados 3 vínculos (1 já existe).')
  assert.equal(resumoNovosVinculos('fiscal', ['A'], 'contabil', ['C', 'D'], [{ tipoOrigem: 'A', tipoDestino: 'C' }, { tipoOrigem: 'A', tipoDestino: 'D' }]),
    'Serão criados 2 vínculos.')
  assert.equal(resumoNovosVinculos('fiscal', ['A'], 'contabil', ['C'], []), 'Todos os vínculos marcados já existem.')
})
