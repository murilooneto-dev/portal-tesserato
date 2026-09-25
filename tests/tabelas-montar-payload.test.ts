// tests/tabelas-montar-payload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarLinhas, validarPayload, LIMITE_LINHAS, MAX_COLUNAS, LIMITE_BYTES_PAYLOAD, type ColunaConfig } from '../lib/tabelas/montar-payload'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const CLI = '44444444-4444-4444-8444-444444444444'

const colunas: ColunaConfig[] = [
  { id: ID1, nome: 'Cliente', tipo: 'cliente', opcoes: null, indiceOrigem: 0 },
  { id: ID2, nome: 'Valor', tipo: 'numero', opcoes: null, indiceOrigem: 1 },
  { id: ID3, nome: 'Vence', tipo: 'data', opcoes: null, indiceOrigem: 2 },
]

interface PayloadFixture {
  setor: string
  nome: string
  colunaChaveId: string | null
  colunas: { id: string; nome: string; tipo: string; ordem: number; opcoes: { valor: string; cor: string }[] | null }[]
  linhas: { v: (string | number | null)[]; clienteId: string | null }[]
}

function payloadValido(): PayloadFixture {
  return {
    setor: 'fiscal',
    nome: 'Certificados',
    colunaChaveId: ID1,
    colunas: [
      { id: ID1, nome: 'Cliente', tipo: 'cliente', ordem: 0, opcoes: null },
      { id: ID2, nome: 'Status', tipo: 'opcoes', ordem: 1, opcoes: [{ valor: 'Ok', cor: '#10b981' }] },
    ],
    linhas: [{ v: ['A', 'Ok'], clienteId: CLI }],
  }
}

test('montarLinhas converte por tipo e guarda por id da coluna', () => {
  const r = montarLinhas(
    [['Empresa A', '1.234,50', '15/03/2026'], ['Empresa B', 20, '2026-04-01']],
    colunas,
    [CLI, null],
  )
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.linhas[0], { v: ['Empresa A', 1234.5, '2026-03-15'], clienteId: CLI })
  assert.deepEqual(r.linhas[1], { v: ['Empresa B', 20, '2026-04-01'], clienteId: null })
})

test('montarLinhas: valor que não converte fica como texto original e é contado', () => {
  const r = montarLinhas([['A', 'abc', 'ontem']], colunas, [null])
  assert.equal(r.linhas[0].v[1], 'abc')
  assert.equal(r.linhas[0].v[2], 'ontem')
  assert.equal(r.naoConvertidas, 2)
})

test('montarLinhas: célula vazia vira null e não conta como não convertida', () => {
  const r = montarLinhas([['A', null, null]], colunas, [null])
  assert.equal(r.linhas[0].v[1], null)
  assert.equal(r.naoConvertidas, 0)
})

test('validarPayload aceita um payload válido', () => {
  const r = validarPayload(payloadValido())
  assert.equal(r.ok, true)
})

test('validarPayload rejeita setor inválido (inclui configuracoes)', () => {
  assert.equal(validarPayload({ ...payloadValido(), setor: 'configuracoes' }).ok, false)
  assert.equal(validarPayload({ ...payloadValido(), setor: 'x' }).ok, false)
})

test('validarPayload rejeita nome vazio e sem colunas', () => {
  assert.equal(validarPayload({ ...payloadValido(), nome: '  ' }).ok, false)
  assert.equal(validarPayload({ ...payloadValido(), colunas: [] }).ok, false)
})

test('validarPayload rejeita tipo inválido e duas colunas Cliente', () => {
  const p = payloadValido()
  p.colunas[1] = { ...p.colunas[1], tipo: 'sim_nao' }
  assert.equal(validarPayload(p).ok, false)
  const q = payloadValido()
  q.colunas[1] = { id: ID2, nome: 'Outro', tipo: 'cliente', ordem: 1, opcoes: null }
  assert.equal(validarPayload(q).ok, false)
})

test('validarPayload rejeita id de coluna repetido ou não-uuid', () => {
  const p = payloadValido()
  p.colunas[1] = { ...p.colunas[1], id: ID1 }
  assert.equal(validarPayload(p).ok, false)
  const q = payloadValido()
  q.colunas[0] = { ...q.colunas[0], id: 'nao-e-uuid' }
  assert.equal(validarPayload(q).ok, false)
})

test('validarPayload rejeita v com tamanho diferente do número de colunas', () => {
  const p = payloadValido()
  p.linhas[0].v = ['A']
  assert.equal(validarPayload(p).ok, false)
  const q = payloadValido()
  q.linhas[0].v = ['A', 'Ok', 'x']
  assert.equal(validarPayload(q).ok, false)
  const r = payloadValido()
  ;(r.linhas[0] as unknown as { v: unknown }).v = 'A'
  assert.equal(validarPayload(r).ok, false)
})

test('validarPayload expande v em dados indexados pelo id da coluna', () => {
  const r = validarPayload(payloadValido())
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.payload.linhas, [{ dados: { [ID1]: 'A', [ID2]: 'Ok' }, clienteId: CLI, ordem: 0 }])
})

test('validarPayload rejeita valor de célula inválido', () => {
  const p = payloadValido()
  ;(p.linhas[0].v as unknown[])[0] = { x: 1 }
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita nomes de coluna iguais ignorando caixa', () => {
  const p = payloadValido()
  p.colunas[0].nome = 'Nome'
  p.colunas[1].nome = 'nome'
  const r = validarPayload(p)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /nome/i)
})

test('validarPayload rejeita mais de MAX_COLUNAS colunas', () => {
  const p = payloadValido()
  p.colunas = Array.from({ length: MAX_COLUNAS + 1 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nome: `C${i}`, tipo: 'texto', ordem: i, opcoes: null,
  }))
  assert.equal(validarPayload(p).ok, false)
  assert.equal(LIMITE_BYTES_PAYLOAD, 3_800_000)
})

test('montarLinhas: opcoes e cliente guardam string mesmo com célula numérica', () => {
  const cfg: ColunaConfig[] = [
    { id: ID1, nome: 'Cli', tipo: 'cliente', opcoes: null, indiceOrigem: 0 },
    { id: ID2, nome: 'Grupo', tipo: 'opcoes', opcoes: [{ valor: '2', cor: '#10b981' }], indiceOrigem: 1 },
    { id: ID3, nome: 'Qtd', tipo: 'numero', opcoes: null, indiceOrigem: 2 },
  ]
  const r = montarLinhas([[1234567000189, 2, 7]], cfg, [null])
  assert.deepEqual(r.linhas[0].v, ['1234567000189', '2', 7])
})

test('validarPayload rejeita coluna-chave inexistente e clienteId inválido', () => {
  assert.equal(validarPayload({ ...payloadValido(), colunaChaveId: ID3 }).ok, false)
  const p = payloadValido()
  p.linhas[0].clienteId = 'abc'
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita acima do limite de linhas', () => {
  const p = payloadValido()
  p.linhas = Array.from({ length: LIMITE_LINHAS + 1 }, () => ({ v: [null, null], clienteId: null }))
  const r = validarPayload(p)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /5\.?000/)
})

test('validarPayload rejeita lixo (não objeto)', () => {
  assert.equal(validarPayload(null).ok, false)
  assert.equal(validarPayload('x').ok, false)
})
