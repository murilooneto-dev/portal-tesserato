// tests/tabelas-montar-payload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarLinhas, validarPayload, LIMITE_LINHAS, type ColunaConfig } from '../lib/tabelas/montar-payload'

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
  linhas: { dados: Record<string, string | number | null>; clienteId: string | null; ordem: number }[]
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
    linhas: [{ dados: { [ID1]: 'A', [ID2]: 'Ok' }, clienteId: CLI, ordem: 0 }],
  }
}

test('montarLinhas converte por tipo e guarda por id da coluna', () => {
  const r = montarLinhas(
    [['Empresa A', '1.234,50', '15/03/2026'], ['Empresa B', 20, '2026-04-01']],
    colunas,
    [CLI, null],
  )
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.linhas[0], {
    dados: { [ID1]: 'Empresa A', [ID2]: 1234.5, [ID3]: '2026-03-15' },
    clienteId: CLI,
    ordem: 0,
  })
  assert.equal(r.linhas[1].clienteId, null)
  assert.equal(r.linhas[1].ordem, 1)
})

test('montarLinhas: valor que não converte fica como texto original e é contado', () => {
  const r = montarLinhas([['A', 'abc', 'ontem']], colunas, [null])
  assert.equal(r.linhas[0].dados[ID2], 'abc')
  assert.equal(r.linhas[0].dados[ID3], 'ontem')
  assert.equal(r.naoConvertidas, 2)
})

test('montarLinhas: célula vazia vira null e não conta como não convertida', () => {
  const r = montarLinhas([['A', null, null]], colunas, [null])
  assert.equal(r.linhas[0].dados[ID2], null)
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

test('validarPayload rejeita dado com chave de coluna inexistente', () => {
  const p = payloadValido()
  p.linhas[0].dados = { [ID1]: 'A', [ID3]: 'x' }
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita coluna-chave inexistente e clienteId inválido', () => {
  assert.equal(validarPayload({ ...payloadValido(), colunaChaveId: ID3 }).ok, false)
  const p = payloadValido()
  p.linhas[0].clienteId = 'abc'
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita acima do limite de linhas', () => {
  const p = payloadValido()
  p.linhas = Array.from({ length: LIMITE_LINHAS + 1 }, (_, i) => ({ dados: {}, clienteId: null, ordem: i }))
  const r = validarPayload(p)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /5\.?000/)
})

test('validarPayload rejeita lixo (não objeto)', () => {
  assert.equal(validarPayload(null).ok, false)
  assert.equal(validarPayload('x').ok, false)
})
