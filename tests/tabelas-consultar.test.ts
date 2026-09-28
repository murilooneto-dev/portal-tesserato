import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parametrosRpc } from '../lib/tabelas/consultar'
import type { Consulta } from '../lib/tabelas/consulta'

const C_NUM = '22222222-2222-4222-8222-222222222222'
const PL = '99999999-9999-4999-8999-999999999999'
const colunas = [{ id: C_NUM, tipo: 'numero' as const }]
const vazia: Consulta = { q: '', filtros: {}, ordem: null, desc: false, semCliente: false }

test('consulta vazia vira parâmetros neutros', () => {
  assert.deepEqual(parametrosRpc(PL, vazia, colunas, 0, 100), {
    p_planilha: PL, p_busca: null, p_filtros: [], p_sem_cliente: false,
    p_ordem_coluna: null, p_ordem_tipo: null, p_ordem_desc: false, p_offset: 0, p_limit: 100,
  })
})

test('busca, filtros, ordem e semCliente são repassados com o tipo da coluna', () => {
  const c: Consulta = { q: 'abc', filtros: { [C_NUM]: { min: 5 } }, ordem: C_NUM, desc: true, semCliente: true }
  const p = parametrosRpc(PL, c, colunas, 200, 100)
  assert.equal(p.p_busca, 'abc')
  assert.deepEqual(p.p_filtros, [{ coluna: C_NUM, tipo: 'numero', min: 5 }])
  assert.equal(p.p_ordem_coluna, C_NUM)
  assert.equal(p.p_ordem_tipo, 'numero')
  assert.equal(p.p_ordem_desc, true)
  assert.equal(p.p_sem_cliente, true)
  assert.equal(p.p_offset, 200)
})

test('offset e limit são normalizados (nunca negativos, limit até 1000)', () => {
  const p = parametrosRpc(PL, vazia, colunas, -5, 99999)
  assert.equal(p.p_offset, 0)
  assert.equal(p.p_limit, 1000)
  assert.equal(parametrosRpc(PL, vazia, colunas, 0, -1).p_limit, 0)
})

test('ordem para coluna que não existe mais é descartada', () => {
  const p = parametrosRpc(PL, { ...vazia, ordem: '66666666-6666-4666-8666-666666666666' }, colunas, 0, 10)
  assert.equal(p.p_ordem_coluna, null)
  assert.equal(p.p_ordem_tipo, null)
})
