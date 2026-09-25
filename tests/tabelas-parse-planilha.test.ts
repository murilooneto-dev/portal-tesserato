import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { lerPlanilha, nomesUnicos } from '../lib/tabelas/parse-planilha'

function xlsx(aoa: unknown[][], nomeAba = 'Plan1'): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomeAba)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

test('lê cabeçalho e linhas, converte data e ignora linhas vazias', () => {
  const buf = xlsx([
    ['Cliente', 'Valor', 'Vencimento'],
    ['Empresa A', 10, new Date(2026, 2, 15)],
    [null, null, null],
    ['Empresa B', 20.5, new Date(2026, 3, 1)],
    [null, null, null],
  ])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.cabecalhos, ['Cliente', 'Valor', 'Vencimento'])
  assert.equal(r.linhas.length, 2)
  assert.deepEqual(r.linhas[0], ['Empresa A', 10, '2026-03-15'])
  assert.deepEqual(r.linhas[1], ['Empresa B', 20.5, '2026-04-01'])
})

test('cabeçalhos vazios e repetidos ganham nome único', () => {
  const buf = xlsx([['Nome', 'Nome', null, 'Nome'], ['a', 'b', 'c', 'd']])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.cabecalhos, ['Nome', 'Nome (2)', 'Coluna 3', 'Nome (3)'])
})

test('nomesUnicos ignora caixa ao detectar repetição', () => {
  assert.deepEqual(nomesUnicos(['a', 'A']), ['a', 'A (2)'])
})

test('linhaCabecalho permite pular título acima do cabeçalho', () => {
  const buf = xlsx([['Relatório de junho'], ['Cliente', 'Valor'], ['A', 1]])
  const r = lerPlanilha(buf, { linhaCabecalho: 2 })
  assert.deepEqual(r.cabecalhos, ['Cliente', 'Valor'])
  assert.deepEqual(r.linhas, [['A', 1]])
})

test('escolhe a aba pedida e lista todas', () => {
  const ws1 = XLSX.utils.aoa_to_sheet([['X'], ['1']])
  const ws2 = XLSX.utils.aoa_to_sheet([['Y'], ['2']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Um')
  XLSX.utils.book_append_sheet(wb, ws2, 'Dois')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const r = lerPlanilha(buf, { aba: 'Dois' })
  assert.deepEqual(r.abas, ['Um', 'Dois'])
  assert.equal(r.aba, 'Dois')
  assert.deepEqual(r.cabecalhos, ['Y'])
})

test('booleano vira Sim/Não e texto é aparado', () => {
  const buf = xlsx([['Ok', 'Obs'], [true, '  oi  '], [false, '   ']])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.linhas, [['Sim', 'oi'], ['Não', null]])
})

test('planilha vazia lança erro claro', () => {
  const buf = xlsx([[null]])
  assert.throws(() => lerPlanilha(buf), /vazia|dados/i)
})

test('nomesUnicos não gera duplicata com literal que aparece depois', () => {
  assert.deepEqual(nomesUnicos(['Nome', 'Nome', 'Nome (2)']), ['Nome', 'Nome (3)', 'Nome (2)'])
})

test('nomesUnicos: vazio não colide com "Coluna N" literal', () => {
  assert.deepEqual(nomesUnicos(['', 'Coluna 1']), ['Coluna 1 (2)', 'Coluna 1'])
})

test('nomesUnicos: resultado sempre único ignorando caixa', () => {
  const ent = ['a', 'A', '', 'Coluna 3', 'a (2)', 'A', '']
  const r = nomesUnicos(ent)
  assert.equal(r.length, ent.length)
  assert.equal(new Set(r.map(x => x.toLowerCase())).size, ent.length)
})
