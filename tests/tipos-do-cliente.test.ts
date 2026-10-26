import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomesParaApagar } from '../lib/tipos-do-cliente'

test('nomesParaApagar: removida da ficha', () => {
  assert.deepEqual(nomesParaApagar(['A', 'B'], ['A'], []), ['B'])
})
test('nomesParaApagar: recriada entra na lista', () => {
  assert.deepEqual(nomesParaApagar(['A'], ['A'], ['A']), ['A'])
})
test('nomesParaApagar: tipo novo que não existia não apaga nada', () => {
  assert.deepEqual(nomesParaApagar([], ['N'], ['N']), [])
})

import { validarTiposNovos } from '../lib/tipos-do-cliente'

const base = { etapas: null, mesesVisiveis: [1, 2], inicioEm: null }
test('validarTiposNovos: aceita e zera mesesVisiveis', () => {
  const r = validarTiposNovos({ A: { ...base, tipoResposta: 'data' } })
  assert.equal(r.error, undefined)
  assert.equal(r.tipos.A.mesesVisiveis, null)
})
test('validarTiposNovos: rejeita nome com espaço, formato inválido e checklist sem etapas', () => {
  assert.ok(validarTiposNovos({ ' A': { ...base, tipoResposta: 'data' } }).error)
  assert.ok(validarTiposNovos({ A: { ...base, tipoResposta: 'xyz' as never } }).error)
  assert.ok(validarTiposNovos({ A: { ...base, tipoResposta: 'checklist' } }).error)
  assert.ok(validarTiposNovos({ A: { ...base, tipoResposta: 'checklist', etapas: [] } }).error)
  assert.ok(validarTiposNovos({ A: { ...base, tipoResposta: 'checklist', etapas: ['x', ' '] } }).error)
})
test('validarTiposNovos: checklist com etapas passa', () => {
  assert.deepEqual(validarTiposNovos({ A: { ...base, tipoResposta: 'checklist', etapas: ['x', 'y'] } }).tipos.A.etapas, ['x', 'y'])
})
