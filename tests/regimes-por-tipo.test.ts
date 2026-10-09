import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarRegimesPorTipo } from '../lib/tarefa-tipo-donos'

const tipos = [
  { nome: 'DCTF', responsavel_id: 'u1' },
  { nome: 'DAS', responsavel_id: 'u1' },
  { nome: 'SPED', responsavel_id: 'u2' },
  { nome: 'ICMS', responsavel_id: null },
]

test('cada tipo recebe os regimes marcados pelo seu dono', () => {
  const mapa = montarRegimesPorTipo(tipos, [{ user_id: 'u1', regimes: ['MEI', 'Simples Nacional'] }])
  assert.deepEqual(mapa, { DCTF: ['MEI', 'Simples Nacional'], DAS: ['MEI', 'Simples Nacional'] })
})

test('dono sem linha, com lista vazia ou nula fica fora do mapa', () => {
  assert.deepEqual(montarRegimesPorTipo(tipos, []), {})
  assert.deepEqual(montarRegimesPorTipo(tipos, [{ user_id: 'u1', regimes: [] }, { user_id: 'u2', regimes: null }]), {})
})
