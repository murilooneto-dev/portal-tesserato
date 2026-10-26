// tests/planilha-competencia.test.ts — mês de referência das planilhas anexadas do Fiscal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { competenciaDaPlanilha, competenciaDeChave, competenciaDeData } from '../lib/planilha-competencia'

function planilha(linhas: unknown[][]): string {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Plan1')
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

const chave = (aamm: string) => `35${aamm}12345678000199550010000012341000012345`.slice(0, 44)

test('competenciaDeData aceita dd/mm/aaaa, aaaa-mm-dd e serial do Excel', () => {
  assert.deepEqual(competenciaDeData('15/09/2026'), { mes: 9, ano: 2026 })
  assert.deepEqual(competenciaDeData('2026-08-03T10:00:00'), { mes: 8, ano: 2026 })
  assert.deepEqual(competenciaDeData(46280), { mes: 9, ano: 2026 }) // 15/09/2026
  assert.equal(competenciaDeData('abc'), null)
})

test('competenciaDeChave lê AAMM da chave', () => {
  assert.deepEqual(competenciaDeChave(chave('2609')), { mes: 9, ano: 2026 })
  assert.equal(competenciaDeChave('123'), null)
})

test('usa o mês mais frequente da coluna de emissão', () => {
  const b64 = planilha([
    ['Chave NF-e', 'Data Emissão', 'Valor'],
    [chave('2609'), '01/09/2026', 10],
    [chave('2609'), '20/09/2026', 10],
    [chave('2608'), '31/08/2026', 10],
  ])
  assert.deepEqual(competenciaDaPlanilha(b64), { mes: 9, ano: 2026 })
})

test('sem coluna de data, cai para a chave', () => {
  const b64 = planilha([
    ['Chave de acesso'],
    [chave('2607')],
    [chave('2607')],
  ])
  assert.deepEqual(competenciaDaPlanilha(b64), { mes: 7, ano: 2026 })
})

test('conteúdo inválido devolve null', () => {
  assert.equal(competenciaDaPlanilha('não é planilha'), null)
  assert.equal(competenciaDaPlanilha(planilha([['Nome'], ['Fulano']])), null)
})
