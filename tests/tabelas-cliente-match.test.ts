// tests/tabelas-cliente-match.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  somenteDigitos, normalizarNome, similaridade, casarCliente, agruparValoresCliente,
  type ClienteMatch,
} from '../lib/tabelas/cliente-match'

const clientes: ClienteMatch[] = [
  { id: 'c1', nome: 'Padaria São José LTDA', cnpj: '12.345.678/0001-90' },
  { id: 'c2', nome: 'Mercado Bom Preço ME', cnpj: '98.765.432/0001-10' },
  { id: 'c3', nome: 'Oficina do João', cnpj: null },
]

test('somenteDigitos remove pontuação', () => {
  assert.equal(somenteDigitos('12.345.678/0001-90'), '12345678000190')
  assert.equal(somenteDigitos(null), '')
})

test('normalizarNome ignora acento, caixa, pontuação e sufixo societário', () => {
  assert.equal(normalizarNome('Padaria São José LTDA'), 'padaria sao jose')
  assert.equal(normalizarNome('PADARIA SAO JOSE - ME'), 'padaria sao jose')
  assert.equal(normalizarNome('Fulano S.A.'), 'fulano')
})

test('casarCliente: CNPJ com ou sem pontuação casa exato', () => {
  assert.deepEqual(casarCliente('12345678000190', clientes), { status: 'exato', clienteId: 'c1', score: 1 })
  assert.equal(casarCliente('98.765.432/0001-10', clientes).clienteId, 'c2')
})

test('casarCliente: nome igual após normalização é exato', () => {
  const r = casarCliente('padaria sao jose', clientes)
  assert.equal(r.status, 'exato')
  assert.equal(r.clienteId, 'c1')
})

test('casarCliente: nome parecido é sugerido, não exato', () => {
  const r = casarCliente('Padaria Sao Jose Comercio', clientes)
  assert.equal(r.status, 'sugerido')
  assert.equal(r.clienteId, 'c1')
})

test('casarCliente: sem parecido é sem_match com clienteId nulo', () => {
  const r = casarCliente('Escritório de Advocacia Zeta', clientes)
  assert.equal(r.status, 'sem_match')
  assert.equal(r.clienteId, null)
})

test('casarCliente: vazio é sem_match', () => {
  assert.equal(casarCliente('   ', clientes).status, 'sem_match')
  assert.equal(casarCliente(null, clientes).status, 'sem_match')
})

test('similaridade: idênticos 1, sem nada em comum 0', () => {
  assert.equal(similaridade('abc', 'abc'), 1)
  assert.equal(similaridade('abcd', 'wxyz'), 0)
})

test('agruparValoresCliente: conta linhas por valor distinto e ignora vazios', () => {
  const g = agruparValoresCliente(['Oficina do João', 'Oficina do João', null, '', 12345678000190], clientes)
  assert.equal(g.length, 2)
  const oficina = g.find(x => x.valor === 'Oficina do João')!
  assert.equal(oficina.linhas, 2)
  assert.equal(oficina.match.clienteId, 'c3')
  assert.equal(g.find(x => x.valor === '12345678000190')!.match.clienteId, 'c1')
})
