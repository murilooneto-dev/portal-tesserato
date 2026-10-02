import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prazosDoMes, prazosDoDia, tomDoAlerta } from '../lib/calendario-grade'
import type { CalendarioEvento } from '../lib/types'

const base = { setor: 'fiscal', descricao: null, created_at: '', created_by: null, interna_dia_mes: null, interna_data: null, oficial_dia_mes: null, oficial_data: null } as const
const ev = (o: Partial<CalendarioEvento>): CalendarioEvento => ({ id: 'x', titulo: 'DAS', tipo_data: 'recorrente', ...base, ...o }) as CalendarioEvento

test('recorrente cai em todo mês, interna e oficial', () => {
  const p = prazosDoMes([ev({ interna_dia_mes: 5, oficial_dia_mes: 15 })], 2026, 10)
  assert.deepEqual(p.map(x => [x.chave, x.variante]), [['2026-10-05', 'interna'], ['2026-10-15', 'oficial']])
})

test('recorrente dia 31 num mês de 30 dias vai para o último dia', () => {
  const p = prazosDoMes([ev({ oficial_dia_mes: 31 })], 2026, 4)
  assert.equal(p[0].chave, '2026-04-30')
  assert.equal(prazosDoMes([ev({ oficial_dia_mes: 31 })], 2027, 2)[0].chave, '2027-02-28')
})

test('data única só aparece no próprio mês e ano', () => {
  const e = ev({ tipo_data: 'unica', interna_data: '2026-10-09' })
  assert.equal(prazosDoMes([e], 2026, 10).length, 1)
  assert.equal(prazosDoMes([e], 2026, 11).length, 0)
  assert.equal(prazosDoMes([e], 2027, 10).length, 0)
})

test('lado não preenchido não gera prazo', () => {
  assert.equal(prazosDoMes([ev({ interna_dia_mes: 3 })], 2026, 10).length, 1)
  assert.equal(prazosDoMes([ev({})], 2026, 10).length, 0)
})

test('ordena por dia e prazosDoDia filtra', () => {
  const p = prazosDoMes([ev({ id: 'a', titulo: 'B', oficial_dia_mes: 10 }), ev({ id: 'b', titulo: 'A', interna_dia_mes: 10 }), ev({ id: 'c', titulo: 'C', interna_dia_mes: 2 })], 2026, 10)
  assert.deepEqual(p.map(x => x.evento.id), ['c', 'b', 'a'])
  assert.equal(prazosDoDia(p, 10).length, 2)
})

test('tom do alerta segue as faixas de alertaColor', () => {
  assert.deepEqual([-2, 0, 1, 2, 5, 6, 10, 11].map(tomDoAlerta), ['dng', 'dng', 'dng', 'warn', 'warn', 'info', 'info', 'neu'])
})
