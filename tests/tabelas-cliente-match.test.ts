// tests/tabelas-cliente-match.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  somenteDigitos, normalizarNome, similaridade, casarCliente, agruparValoresCliente, chaveDocumento,
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

test('casarCliente: CNPJ com zero à esquerda perdido em planilha (13 dígitos) é exato após padding', () => {
  const clientesComLeadingZero: ClienteMatch[] = [
    { id: 'c_leading', nome: 'Empresa com Leading Zero', cnpj: '01.234.567/0001-89' },
  ]
  const r = casarCliente('1234567000189', clientesComLeadingZero)
  assert.equal(r.status, 'exato')
  assert.equal(r.clienteId, 'c_leading')
})

test('casarCliente: CPF (14 digits sem formatação) é exato', () => {
  const clientesComCPF: ClienteMatch[] = [
    { id: 'c_cpf1', nome: 'Pessoa Física', cnpj: '123.456.789-09' },
  ]
  const r = casarCliente('12345678909', clientesComCPF)
  assert.equal(r.status, 'exato')
  assert.equal(r.clienteId, 'c_cpf1')
})

test('casarCliente: CPF com zero à esquerda perdido (10 dígitos) é exato após padding', () => {
  const clientesComCPFLeadingZero: ClienteMatch[] = [
    { id: 'c_cpf2', nome: 'Pessoa Física com Zero', cnpj: '012.345.678-90' },
  ]
  const r = casarCliente('1234567890', clientesComCPFLeadingZero)
  assert.equal(r.status, 'exato')
  assert.equal(r.clienteId, 'c_cpf2')
})

test('casarCliente: documento com 14 dígitos que não existe no cliente é sem_match', () => {
  const r = casarCliente('99999999999999', clientes)
  assert.equal(r.status, 'sem_match')
  assert.equal(r.clienteId, null)
})

test('chaveDocumento normaliza documentos com zero à esquerda', () => {
  assert.equal(chaveDocumento('01234567000189'), '01234567000189')  // 14 digits CNPJ
  assert.equal(chaveDocumento('1234567000189'), '01234567000189')   // 13 digits -> pad to 14
  assert.equal(chaveDocumento('01234567890'), '01234567890')        // 11 digits CPF
  assert.equal(chaveDocumento('1234567890'), '01234567890')         // 10 digits -> pad to 11
  assert.equal(chaveDocumento('abc'), '')
  assert.equal(chaveDocumento(null), '')
})

test('casarCliente: dois clientes com o mesmo nome (matriz/filial) é sugerido, não exato', () => {
  const dup: ClienteMatch[] = [
    { id: 'm1', nome: 'Padaria Central LTDA', cnpj: '11.111.111/0001-11' },
    { id: 'm2', nome: 'Padaria Central', cnpj: '11.111.111/0002-92' },
  ]
  assert.deepEqual(casarCliente('padaria central', dup), { status: 'sugerido', clienteId: 'm1', score: 1 })
})

test('casarCliente: dois clientes com o mesmo CNPJ é sugerido, não exato', () => {
  const dup: ClienteMatch[] = [
    { id: 'd1', nome: 'Alfa', cnpj: '12.345.678/0001-90' },
    { id: 'd2', nome: 'Beta', cnpj: '12345678000190' },
  ]
  assert.deepEqual(casarCliente('12345678000190', dup), { status: 'sugerido', clienteId: 'd1', score: 1 })
})

test('casarCliente: casamento único continua exato', () => {
  assert.equal(casarCliente('Oficina do João', clientes).status, 'exato')
})
