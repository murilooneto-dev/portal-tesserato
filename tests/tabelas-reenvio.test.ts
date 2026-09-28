import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  casarColunas, chavesDuplicadas, calcularDiffReenvio, montarAtualizacoes,
  type ColunaExistente, type LinhaExistente, type LinhaImportada, type LinhaAtualizar,
} from '../lib/tabelas/reenvio'

const C_CHAVE = '11111111-1111-4111-8111-111111111111'
const C_B = '22222222-2222-4222-8222-222222222222'
const C_C = '33333333-3333-4333-8333-333333333333'

const existentes: ColunaExistente[] = [
  { id: C_CHAVE, nome: 'Chave', tipo: 'texto', opcoes: null },
  { id: C_B, nome: 'Coluna B', tipo: 'texto', opcoes: null },
]

test('casarColunas casa por nome sem diferenciar maiúsculas/minúsculas, aparado', () => {
  const r = casarColunas(['  chave  ', 'COLUNA B', 'Coluna Nova'], existentes)
  assert.deepEqual(r.casadas, [
    { id: C_CHAVE, nome: 'Chave', tipo: 'texto', opcoes: null, indiceOrigem: 0 },
    { id: C_B, nome: 'Coluna B', tipo: 'texto', opcoes: null, indiceOrigem: 1 },
  ])
  assert.deepEqual(r.naoReconhecidas, [{ nome: 'Coluna Nova', indiceOrigem: 2 }])
})

test('chavesDuplicadas ignora valores vazios e devolve só os repetidos', () => {
  assert.deepEqual(chavesDuplicadas(['A', 'B', 'A', null, '', 'C', 'a']), ['A'])
  assert.deepEqual(chavesDuplicadas(['A', 'B', 'C']), [])
})

test('calcularDiffReenvio: chave nova vira linha nova', () => {
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'NOVA', dados: { [C_CHAVE]: 'NOVA', [C_B]: 'valor' } },
  ]
  const r = calcularDiffReenvio(importadas, [], C_CHAVE)
  assert.equal(r.novas.length, 1)
  assert.deepEqual(r.novas[0].dados, { [C_CHAVE]: 'NOVA', [C_B]: 'valor' })
  assert.equal(r.atualizar.length, 0)
  assert.equal(r.ausentes.length, 0)
})

test('calcularDiffReenvio: célula vazia no banco recebendo valor é sem conflito', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: null } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'preenchido' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.deepEqual(r.atualizar[0].semConflito, [{ coluna: C_B, de: null, para: 'preenchido' }])
  assert.deepEqual(r.atualizar[0].comConflito, [])
})

test('calcularDiffReenvio: célula com valor divergente é conflito', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'valor antigo' } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'valor novo' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.deepEqual(r.atualizar[0].comConflito, [{ coluna: C_B, de: 'valor antigo', para: 'valor novo' }])
  assert.deepEqual(r.atualizar[0].semConflito, [])
})

test('calcularDiffReenvio: linha com múltiplas colunas divergentes é UMA entrada em atualizar', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'antigo', [C_C]: null } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'novo', [C_C]: 'preenche' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.equal(r.atualizar[0].comConflito.length, 1)
  assert.equal(r.atualizar[0].semConflito.length, 1)
})

test('calcularDiffReenvio: mesma chave, tudo igual, não entra em atualizar', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'igual' } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'igual' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 0)
  assert.equal(r.ausentes.length, 0)
})

test('calcularDiffReenvio: chave do banco que não veio no arquivo é ausente', () => {
  const existentesDb: LinhaExistente[] = [
    { id: 'linha-1', dados: { [C_CHAVE]: 'FICOU' } },
    { id: 'linha-2', dados: { [C_CHAVE]: 'SUMIU' } },
  ]
  const importadas: LinhaImportada[] = [{ indiceOrigem: 0, chaveValor: 'FICOU', dados: { [C_CHAVE]: 'FICOU' } }]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.ausentes.length, 1)
  assert.equal(r.ausentes[0].id, 'linha-2')
})

test('montarAtualizacoes: sem conflito sempre aplica; com conflito só se resolução for "planilha"', () => {
  const linhas: LinhaAtualizar[] = [
    { linhaId: 'l1', indiceOrigem: 0, semConflito: [{ coluna: C_B, de: null, para: 'x' }], comConflito: [{ coluna: C_C, de: 'a', para: 'b' }] },
    { linhaId: 'l2', indiceOrigem: 1, semConflito: [], comConflito: [{ coluna: C_B, de: 'c', para: 'd' }] },
  ]
  const r = montarAtualizacoes(linhas, { l1: 'planilha' })
  assert.deepEqual(r, [
    { linha: 'l1', coluna: C_B, de: null, para: 'x' },
    { linha: 'l1', coluna: C_C, de: 'a', para: 'b' },
  ])
})

test('montarAtualizacoes: resolução ausente do mapa conta como "manter sistema" (padrão)', () => {
  const linhas: LinhaAtualizar[] = [
    { linhaId: 'l1', indiceOrigem: 0, semConflito: [], comConflito: [{ coluna: C_B, de: 'a', para: 'b' }] },
  ]
  assert.deepEqual(montarAtualizacoes(linhas, {}), [])
})
