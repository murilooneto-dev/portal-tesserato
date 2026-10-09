// tests/dashboard-meu.test.ts — modo "Meu" do Dashboard do Fiscal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarTiposDoProgresso } from '../lib/tarefa-tipo-visibilidade'
import { mesmoResponsavel, calcularMeu, visaoDaUrl } from '../lib/dashboard-meu'

const cli = (id: string, responsavel: string | null) => ({ id, nome: `Cliente ${id}`, responsavel })
const tar = (cliente_id: string, tipo: string, concluida = false) => ({ cliente_id, tipo, concluida })
const tipos = (o: Record<string, string[]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new Set(v)]))

test('responsável compara sem maiúscula e espaço nas pontas (mesma regra do resto do Fiscal)', () => {
  assert.equal(mesmoResponsavel('  Maurício Silva ', 'MAURÍCIO silva'), true)
  assert.equal(mesmoResponsavel('Maurício', 'Mauricio'), false)
  assert.equal(mesmoResponsavel('Fiscal', 'Fiscal Dois'), false)
  assert.equal(mesmoResponsavel(null, 'Fiscal'), false)
  assert.equal(mesmoResponsavel('', ''), false)
  assert.equal(mesmoResponsavel('Fiscal', undefined), false)
})

test('visão vem da URL: só "meu" muda, o resto é setor', () => {
  assert.equal(visaoDaUrl('meu'), 'meu')
  assert.equal(visaoDaUrl('setor'), 'setor')
  assert.equal(visaoDaUrl('x'), 'setor')
  assert.equal(visaoDaUrl(undefined), 'setor')
  assert.equal(visaoDaUrl(['meu']), 'setor')
})

test('Meu devolve só os clientes do usuário e as tarefas deles', () => {
  const r = calcularMeu({
    clientes: [cli('1', 'Fiscal'), cli('2', 'Outro'), cli('3', 'fiscal'), cli('4', null)],
    nomeUsuario: 'FISCAL',
    tarefas: [tar('1', 'DAS', true), tar('2', 'DAS', true), tar('3', 'ISS')],
    tiposDoProgresso: tipos({ '1': ['DAS'], '2': ['DAS'], '3': ['ISS', 'DAS'] }),
    tiposBrutos: tipos({ '1': ['DAS'], '2': ['DAS'], '3': ['ISS', 'DAS'] }),
    donoNomePorTipo: {},
  })
  assert.deepEqual(r.clientes.map(c => c.id), ['1', '3'])
  assert.deepEqual(r.tarefas.map(t => t.cliente_id), ['1', '3'])
  assert.equal(r.total, 3)
  assert.equal(r.concluidas, 1)
  assert.deepEqual(r.pendencias.map(p => [p.cliente.id, p.tipos]), [['3', ['DAS', 'ISS']]])
  assert.deepEqual(r.encaminhadas, [])
})

test('tarefa concluída fora do progresso não conta', () => {
  const r = calcularMeu({
    clientes: [cli('1', 'Fiscal')],
    nomeUsuario: 'Fiscal',
    tarefas: [tar('1', 'DAS', true), tar('1', 'XYZ', true)],
    tiposDoProgresso: tipos({ '1': ['DAS'] }),
    tiposBrutos: tipos({ '1': ['DAS'] }),
    donoNomePorTipo: {},
  })
  assert.equal(r.concluidas, 1)
  assert.equal(r.total, 1)
})

test('tarefas encaminhadas ao usuário em clientes de outros aparecem à parte', () => {
  const r = calcularMeu({
    clientes: [cli('1', 'Fiscal'), cli('2', 'Outro'), cli('3', 'Outro')],
    nomeUsuario: 'Fiscal',
    tarefas: [tar('2', 'ENTRADA', true), tar('1', 'ENTRADA')],
    tiposDoProgresso: tipos({ '1': ['ENTRADA'], '2': ['DAS'], '3': ['DAS'] }),
    tiposBrutos: tipos({ '1': ['ENTRADA'], '2': ['ENTRADA', 'DAS'], '3': ['DAS', 'ENTRADA'] }),
    donoNomePorTipo: { ENTRADA: 'fiscal', DAS: null },
  })
  // cliente 1 é do usuário: ENTRADA dele já está no progresso, não duplica
  assert.deepEqual(r.encaminhadas.map(e => [e.cliente.id, e.tipo, e.concluida]), [['2', 'ENTRADA', true], ['3', 'ENTRADA', false]])
  assert.deepEqual(r.pendencias.map(p => [p.cliente.id, p.tipos]), [['1', ['ENTRADA']], ['3', ['ENTRADA']]])
})

test('tipo encaminhado a outra pessoa não vira encaminhada do usuário', () => {
  const r = calcularMeu({
    clientes: [cli('2', 'Outro')],
    nomeUsuario: 'Fiscal',
    tarefas: [],
    tiposDoProgresso: tipos({ '2': [] }),
    tiposBrutos: tipos({ '2': ['ENTRADA'] }),
    donoNomePorTipo: { ENTRADA: 'Maria' },
  })
  assert.deepEqual(r.encaminhadas, [])
  assert.deepEqual(r.pendencias, [])
})

test('sem nome de usuário não sobra nada', () => {
  const r = calcularMeu({
    clientes: [cli('1', null)], nomeUsuario: null, tarefas: [],
    tiposDoProgresso: tipos({ '1': ['DAS'] }), tiposBrutos: tipos({ '1': ['DAS'] }), donoNomePorTipo: { DAS: '' },
  })
  assert.equal(r.clientes.length, 0)
  assert.equal(r.encaminhadas.length, 0)
})

test('tipo do próprio usuário em cliente próprio não some do Meu', () => {
  const donoNomePorTipo = { ENTRADA: ' Fiscal ' }
  const tiposBrutos = tipos({ '1': ['ENTRADA', 'DAS'] })
  const tiposDoProgresso = { '1': new Set(filtrarTiposDoProgresso(tiposBrutos['1'], 'FISCAL', donoNomePorTipo)) }
  const r = calcularMeu({
    clientes: [cli('1', 'FISCAL')], nomeUsuario: 'fiscal', tarefas: [],
    tiposDoProgresso, tiposBrutos, donoNomePorTipo,
  })
  assert.equal(r.total, 2)
  assert.deepEqual(r.pendencias.map(p => p.tipos), [['DAS', 'ENTRADA']])
  assert.deepEqual(r.encaminhadas, [])
})

test('encaminhadas respeitam os regimes que o dono marcou', () => {
  const clientes = [
    { id: 'c1', responsavel: 'Ana', regime: 'MEI' },
    { id: 'c2', responsavel: 'Ana', regime: 'Lucro Real' },
  ]
  const r = calcularMeu({
    clientes,
    nomeUsuario: 'Bia',
    tarefas: [],
    tiposDoProgresso: {},
    tiposBrutos: { c1: new Set(['DCTF']), c2: new Set(['DCTF']) },
    donoNomePorTipo: { DCTF: 'Bia' },
    regimesPorTipo: { DCTF: ['MEI'] },
  })
  assert.deepEqual(r.encaminhadas.map(e => e.cliente.id), ['c1'])
})

test('sem regimesPorTipo as encaminhadas ficam como antes', () => {
  const r = calcularMeu({
    clientes: [{ id: 'c2', responsavel: 'Ana', regime: 'Lucro Real' }],
    nomeUsuario: 'Bia',
    tarefas: [],
    tiposDoProgresso: {},
    tiposBrutos: { c2: new Set(['DCTF']) },
    donoNomePorTipo: { DCTF: 'Bia' },
  })
  assert.equal(r.encaminhadas.length, 1)
})
