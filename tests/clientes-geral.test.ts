// tests/clientes-geral.test.ts — filtros e ordem do Cadastro de clientes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SETORES_DE_CLIENTE, TODOS, filtrarClientesGeral, proximaOrdenacao, ariaSort, setoresDoCliente,
  type ClienteGeralLinha, type FiltrosClientesGeral,
} from '../lib/clientes-geral'

const cli = (nome: string, extra: Partial<ClienteGeralLinha> = {}): ClienteGeralLinha => ({
  nome, cnpj: null, setores: ['fiscal'], clientes_fiscal: { regime: null, atividade: [] }, ...extra,
})
const lista = [
  cli('Comércio São José LTDA', { cnpj: '12.345.678/0001-90', setores: ['fiscal', 'contabil'], clientes_fiscal: { regime: 'Simples Nacional', atividade: ['Comércio'] } }),
  cli('Alfa Serviços', { setores: ['societario', 'financeiro'], clientes_fiscal: null }),
  cli('Beta Indústria', { cnpj: '98765432000110', clientes_fiscal: { regime: 'Lucro Presumido', atividade: ['Indústria', 'Serviço'] } }),
]
const f = (extra: Partial<FiltrosClientesGeral> = {}): FiltrosClientesGeral => ({ busca: '', regime: TODOS, setor: TODOS, atividades: [], ...extra })
const nomes = (r: ClienteGeralLinha[]) => r.map(c => c.nome)

test('setores de cliente não incluem Configurações', () => {
  assert.deepEqual(SETORES_DE_CLIENTE, ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'])
  assert.deepEqual(setoresDoCliente(['financeiro', 'configuracoes', 'fiscal']), ['fiscal', 'financeiro'])
  assert.deepEqual(setoresDoCliente(null), [])
})

test('busca por nome ignora acento e maiúscula', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: 'sao jose' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: 'SERVIÇOS' }), null)), ['Alfa Serviços'])
})

test('busca por CNPJ com ou sem pontuação', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '12.345' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '12345678' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '98.765.432/0001-10' }), null)), ['Beta Indústria'])
})

test('busca com letras procura só no nome; CNPJ só com pelo menos 3 dígitos', () => {
  const l = [cli('Padaria Central', { cnpj: '12.345.678/0001-90' }), cli('Posto 2 Irmãos')]
  assert.deepEqual(nomes(filtrarClientesGeral(l, f({ busca: 'Posto 2' }), null)), ['Posto 2 Irmãos'])
  assert.deepEqual(nomes(filtrarClientesGeral(l, f({ busca: 'Padaria 1' }), null)), [])
  assert.deepEqual(nomes(filtrarClientesGeral(l, f({ busca: '12' }), null)), [])
  assert.deepEqual(nomes(filtrarClientesGeral(l, f({ busca: '12.345' }), null)), ['Padaria Central'])
})

test('filtros de regime, setor e atividade', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ regime: 'Lucro Presumido' }), null)), ['Beta Indústria'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ setor: 'financeiro' }), null)), ['Alfa Serviços'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ atividades: ['Serviço', 'Comércio'] }), null)), ['Comércio São José LTDA', 'Beta Indústria'])
})

test('ordem por nome e por regime (sem regime primeiro no crescente)', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'nome', direcao: 'asc' })), ['Alfa Serviços', 'Beta Indústria', 'Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'nome', direcao: 'desc' })), ['Comércio São José LTDA', 'Beta Indústria', 'Alfa Serviços'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'regime', direcao: 'asc' })), ['Alfa Serviços', 'Beta Indústria', 'Comércio São José LTDA'])
})

test('ciclo da ordenação e aria-sort', () => {
  const a = proximaOrdenacao(null, 'nome')
  assert.deepEqual(a, { campo: 'nome', direcao: 'asc' })
  const b = proximaOrdenacao(a, 'nome')
  assert.deepEqual(b, { campo: 'nome', direcao: 'desc' })
  assert.equal(proximaOrdenacao(b, 'nome'), null)
  assert.deepEqual(proximaOrdenacao(b, 'regime'), { campo: 'regime', direcao: 'asc' })
  assert.equal(ariaSort(a, 'nome'), 'ascending')
  assert.equal(ariaSort(b, 'nome'), 'descending')
  assert.equal(ariaSort(a, 'regime'), 'none')
})
