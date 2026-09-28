import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConsulta, serializeConsulta, toRpcFiltros, alternarOrdem, temConsultaAtiva, MAX_BUSCA, type Consulta } from '../lib/tabelas/consulta'

const C_TXT = '11111111-1111-4111-8111-111111111111'
const C_NUM = '22222222-2222-4222-8222-222222222222'
const C_DAT = '33333333-3333-4333-8333-333333333333'
const C_OPC = '44444444-4444-4444-8444-444444444444'
const C_CLI = '55555555-5555-4555-8555-555555555555'
const colunas = [
  { id: C_TXT, tipo: 'texto' as const },
  { id: C_NUM, tipo: 'numero' as const },
  { id: C_DAT, tipo: 'data' as const },
  { id: C_OPC, tipo: 'opcoes' as const },
  { id: C_CLI, tipo: 'cliente' as const },
]
const vazia: Consulta = { q: '', filtros: {}, ordem: null, desc: false, semCliente: false }

test('parametros vazios dão a consulta padrão', () => {
  assert.deepEqual(parseConsulta({}, colunas), vazia)
})

test('q é aparada e limitada', () => {
  assert.equal(parseConsulta({ q: '  padaria  ' }, colunas).q, 'padaria')
  assert.equal(parseConsulta({ q: 'x'.repeat(MAX_BUSCA + 50) }, colunas).q.length, MAX_BUSCA)
})

test('filtros válidos por tipo, com formato brasileiro', () => {
  const filtros = JSON.stringify({
    [C_TXT]: { v: ' jos ' },
    [C_NUM]: { min: '1.234,5', max: 5000 },
    [C_DAT]: { de: '15/03/2026', ate: '2026-12-31' },
    [C_OPC]: { v: 'Feito' },
    [C_CLI]: { v: 'acme' },
  })
  const c = parseConsulta({ filtros }, colunas)
  assert.deepEqual(c.filtros[C_TXT], { v: 'jos' })
  assert.deepEqual(c.filtros[C_NUM], { min: 1234.5, max: 5000 })
  assert.deepEqual(c.filtros[C_DAT], { de: '2026-03-15', ate: '2026-12-31' })
  assert.deepEqual(c.filtros[C_OPC], { v: 'Feito' })
  assert.deepEqual(c.filtros[C_CLI], { v: 'acme' })
})

test('filtros inválidos são ignorados sem erro', () => {
  assert.deepEqual(parseConsulta({ filtros: '{não é json' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: '[1,2]' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: '"texto"' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: 'x'.repeat(5000) }, colunas).filtros, {})
  const c = parseConsulta({
    filtros: JSON.stringify({
      '66666666-6666-4666-8666-666666666666': { v: 'coluna que não existe' },
      __proto__: { v: 'x' },
      [C_NUM]: { min: 'abc', max: '' },
      [C_DAT]: { de: '31/02/2026' },
      [C_TXT]: { v: '   ' },
    }),
  }, colunas)
  assert.deepEqual(c.filtros, {})
})

test('ordem só vale para coluna existente; dir=desc', () => {
  assert.equal(parseConsulta({ ordem: C_NUM }, colunas).ordem, C_NUM)
  assert.equal(parseConsulta({ ordem: 'lixo' }, colunas).ordem, null)
  assert.equal(parseConsulta({ ordem: '66666666-6666-4666-8666-666666666666' }, colunas).ordem, null)
  assert.equal(parseConsulta({ ordem: C_NUM, dir: 'desc' }, colunas).desc, true)
  assert.equal(parseConsulta({ ordem: C_NUM, dir: 'qualquer' }, colunas).desc, false)
})

test('semCliente só vale se há coluna cliente', () => {
  assert.equal(parseConsulta({ semCliente: '1' }, colunas).semCliente, true)
  assert.equal(parseConsulta({ semCliente: '1' }, colunas.filter(c => c.tipo !== 'cliente')).semCliente, false)
})

test('serialize é vazio no padrão e ida-e-volta preserva a consulta', () => {
  assert.equal(serializeConsulta(vazia), '')
  const original: Consulta = {
    q: 'padaria & cia',
    filtros: { [C_NUM]: { min: 10, max: 100 }, [C_DAT]: { de: '2026-01-01' } },
    ordem: C_NUM, desc: true, semCliente: true,
  }
  const qs = serializeConsulta(original, 3)
  const sp = new URLSearchParams(qs)
  assert.equal(sp.get('pagina'), '3')
  const volta = parseConsulta({
    q: sp.get('q') ?? undefined, filtros: sp.get('filtros') ?? undefined, ordem: sp.get('ordem') ?? undefined,
    dir: sp.get('dir') ?? undefined, semCliente: sp.get('semCliente') ?? undefined,
  }, colunas)
  assert.deepEqual(volta, original)
})

test('serialize omite pagina 1 e ordem asc não escreve dir', () => {
  const qs = serializeConsulta({ ...vazia, ordem: C_TXT }, 1)
  const sp = new URLSearchParams(qs)
  assert.equal(sp.get('pagina'), null)
  assert.equal(sp.get('ordem'), C_TXT)
  assert.equal(sp.get('dir'), null)
})

test('toRpcFiltros leva o tipo da coluna e ignora colunas removidas', () => {
  const c: Consulta = { ...vazia, filtros: { [C_NUM]: { min: 1 }, '66666666-6666-4666-8666-666666666666': { v: 'x' } } }
  assert.deepEqual(toRpcFiltros(c, colunas), [{ coluna: C_NUM, tipo: 'numero', min: 1 }])
})

test('alternarOrdem: nova coluna asc, depois desc, depois limpa', () => {
  const a = alternarOrdem(vazia, C_TXT)
  assert.deepEqual([a.ordem, a.desc], [C_TXT, false])
  const b = alternarOrdem(a, C_TXT)
  assert.deepEqual([b.ordem, b.desc], [C_TXT, true])
  const c = alternarOrdem(b, C_TXT)
  assert.deepEqual([c.ordem, c.desc], [null, false])
  const d = alternarOrdem(b, C_NUM)
  assert.deepEqual([d.ordem, d.desc], [C_NUM, false])
})

test('temConsultaAtiva ignora ordenação', () => {
  assert.equal(temConsultaAtiva(vazia), false)
  assert.equal(temConsultaAtiva({ ...vazia, ordem: C_TXT }), false)
  assert.equal(temConsultaAtiva({ ...vazia, q: 'a' }), true)
  assert.equal(temConsultaAtiva({ ...vazia, semCliente: true }), true)
  assert.equal(temConsultaAtiva({ ...vazia, filtros: { [C_TXT]: { v: 'a' } } }), true)
})
