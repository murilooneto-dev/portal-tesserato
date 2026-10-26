import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTiposDoCliente, nomeNoCatalogo } from '../lib/tarefa-tipos'

const tipos = [
  { nome: 'A', cliente_id: null, f: 1 },
  { nome: 'A', cliente_id: 'c1', f: 2 },
  { nome: 'A', cliente_id: 'c2', f: 3 },
  { nome: 'B', cliente_id: null, f: 4 },
]

test('resolverTiposDoCliente: o tipo do cliente vence o do setor e o de outro cliente sai', () => {
  const r = resolverTiposDoCliente(tipos, 'c1')
  assert.equal(r.length, 2)
  assert.equal(r.find(t => t.nome === 'A')?.f, 2)
  assert.equal(r.find(t => t.nome === 'B')?.f, 4)
})

test('resolverTiposDoCliente: cliente sem tipo próprio fica com o do setor', () => {
  assert.equal(resolverTiposDoCliente(tipos, 'c9').find(t => t.nome === 'A')?.f, 1)
})

test('nomeNoCatalogo: devolve a grafia do catálogo ou null', () => {
  assert.equal(nomeNoCatalogo(['Banco Santander'], ' banco santander '), 'Banco Santander')
  assert.equal(nomeNoCatalogo([], 'x'), null)
})
