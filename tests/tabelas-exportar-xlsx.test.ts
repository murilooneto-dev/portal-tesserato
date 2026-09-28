import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { montarXlsx, nomeAbaSeguro, nomeArquivoSeguro } from '../lib/tabelas/exportar-xlsx'
import { lerPlanilha } from '../lib/tabelas/parse-planilha'

const A = 'a1111111-1111-4111-8111-111111111111'
const B = 'b2222222-2222-4222-8222-222222222222'
const C = 'c3333333-3333-4333-8333-333333333333'
const D = 'd4444444-4444-4444-8444-444444444444'
const colunas = [
  { id: A, nome: 'Nome', tipo: 'texto' as const },
  { id: B, nome: 'Valor', tipo: 'numero' as const },
  { id: C, nome: 'Vencimento', tipo: 'data' as const },
  { id: D, nome: 'Status', tipo: 'opcoes' as const },
]

function ler(nome: string, linhas: { dados: Record<string, string | number | null> }[]) {
  const bytes = montarXlsx(nome, colunas, linhas)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return lerPlanilha(buf)
}

test('ida e volta: cabeçalhos, número real, data real e vazios', () => {
  const r = ler('Certificados', [
    { dados: { [A]: 'Padaria', [B]: 1234.5, [C]: '2026-03-15', [D]: 'Feito' } },
    { dados: { [A]: 'Mercado', [B]: null, [C]: null, [D]: null } },
  ])
  assert.deepEqual(r.cabecalhos, ['Nome', 'Valor', 'Vencimento', 'Status'])
  assert.deepEqual(r.linhas[0], ['Padaria', 1234.5, '2026-03-15', 'Feito'])
  assert.deepEqual(r.linhas[1], ['Mercado', null, null, null])
})

test('valor legado que não converteu continua como texto; quebra de linha é preservada', () => {
  const r = ler('T', [{ dados: { [A]: 'Rua X\nSala 4', [B]: 'abc', [C]: 'ontem', [D]: null } }])
  assert.equal(r.linhas[0][0], 'Rua X\nSala 4')
  assert.equal(r.linhas[0][1], 'abc')
  assert.equal(r.linhas[0][2], 'ontem')
})

test('texto que parece fórmula continua sendo texto (não vira fórmula)', () => {
  const bytes = montarXlsx('T', colunas, [{ dados: { [A]: '=SOMA(A1:A2)', [B]: null, [C]: null, [D]: null } }])
  const wb = XLSX.read(bytes, { type: 'array' })
  const cel = wb.Sheets[wb.SheetNames[0]]['A2']
  assert.equal(cel.t, 's')
  assert.equal(cel.f, undefined)
})

test('tabela sem linhas gera só o cabeçalho', () => {
  const bytes = montarXlsx('Vazia', colunas, [])
  const wb = XLSX.read(bytes, { type: 'array' })
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.equal(aoa.length, 1)
})

test('nomeAbaSeguro remove caracteres proibidos e limita a 31', () => {
  assert.equal(nomeAbaSeguro('Clientes: [A]/B*?\\'), 'Clientes AB')
  assert.equal(nomeAbaSeguro('x'.repeat(50)).length, 31)
  assert.equal(nomeAbaSeguro('   '), 'Tabela')
  assert.equal(nomeAbaSeguro(':[]'), 'Tabela')
})

test('nomeArquivoSeguro: sem acento, minúsculo, hífens, extensão', () => {
  assert.equal(nomeArquivoSeguro('Relatório: A/B — 2026'), 'relatorio-a-b-2026.xlsx')
  assert.equal(nomeArquivoSeguro('***'), 'tabela.xlsx')
  assert.ok(nomeArquivoSeguro('x'.repeat(200)).length <= 65)
})
