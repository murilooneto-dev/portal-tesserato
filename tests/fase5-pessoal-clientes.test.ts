// tests/fase5-pessoal-clientes.test.ts — Clientes do Pessoal com faixa dos 12 meses (opção B).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { progressoMensalPessoal } from '../lib/pessoal-progresso'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const ARQUIVOS_TOCADOS = [
  'app/pessoal/clientes/page.tsx',
  'components/pessoal/ClientesListaPessoal.tsx',
  'lib/pessoal-progresso.ts',
]

test('helper de progresso: retorna os 12 meses', () => {
  const r = progressoMensalPessoal({ esperadasBase: [], mesesVisiveisPorTipo: {}, tarefas: [], parcelamentosAtivos: new Set() })
  assert.deepEqual(Object.keys(r).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  for (let m = 1; m <= 12; m++) assert.deepEqual(r[m], { total: 0, concluidas: 0, pct: null })
})

test('helper de progresso: 13º (meses_visiveis [11,12]) só conta em nov/dez', () => {
  const r = progressoMensalPessoal({
    esperadasBase: ['13º Salário'],
    mesesVisiveisPorTipo: { '13º Salário': [11, 12] },
    tarefas: [
      { mes: 1, concluida: true, tipo: '13º Salário', parcelamento_id: null },
      { mes: 11, concluida: true, tipo: '13º Salário', parcelamento_id: null },
      { mes: 12, concluida: false, tipo: '13º Salário', parcelamento_id: null },
    ],
    parcelamentosAtivos: new Set(),
  })
  assert.equal(r[1].total, 0, 'jan não conta o 13º')
  assert.equal(r[1].pct, null)
  assert.deepEqual(r[11], { total: 1, concluidas: 1, pct: 100 })
  assert.deepEqual(r[12], { total: 1, concluidas: 0, pct: 0 })
})

test('helper de progresso: cliente com 2 tarefas e uma só em nov retorna 0% em jan e 50% em nov', () => {
  const r = progressoMensalPessoal({
    esperadasBase: ['IRPF', 'DARF'],
    mesesVisiveisPorTipo: {},
    tarefas: [{ mes: 11, concluida: true, tipo: 'IRPF', parcelamento_id: null }],
    parcelamentosAtivos: new Set(),
  })
  assert.deepEqual(r[1], { total: 2, concluidas: 0, pct: 0 })
  assert.deepEqual(r[11], { total: 2, concluidas: 1, pct: 50 })
})

test('helper de progresso: tarefa de parcelamento conta só com parcelamento ativo', () => {
  const tarefas = [{ mes: 3, concluida: true, tipo: 'Parcelamento X', parcelamento_id: 'p1' }]
  const ativo = progressoMensalPessoal({ esperadasBase: [], mesesVisiveisPorTipo: {}, tarefas, parcelamentosAtivos: new Set(['p1']) })
  assert.deepEqual(ativo[3], { total: 1, concluidas: 1, pct: 100 })
  const inativo = progressoMensalPessoal({ esperadasBase: [], mesesVisiveisPorTipo: {}, tarefas, parcelamentosAtivos: new Set() })
  assert.deepEqual(inativo[3], { total: 0, concluidas: 0, pct: null })
})

test('Clientes do Pessoal: faixa dos 12 meses no desenho da opção B', () => {
  const src = ler('components/pessoal/ClientesListaPessoal.tsx')
  assert.ok(src.includes('grid-cols-12'), 'faixa de 12 colunas')
  assert.ok(src.includes('COR[tomDoPercentual(pct)]'), 'cores pelo tom do percentual (MonthPill)')
  assert.ok(src.includes('var(--acc)'), 'contorno do mês atual')
  assert.ok(src.includes('aria-current'), 'mês atual marcado')
  assert.ok(src.includes('MESES.map'), 'ano inteiro sempre visível')
  assert.ok(src.includes("from '@/components/ui/NomeCliente'"), 'nome pelo NomeCliente')
  assert.ok(src.includes('P{cliente.prioridade}'), 'P1 mantido')
  assert.ok(src.includes('overflow-x-auto'), 'faixa em contêiner com rolagem contida')
})

test('Clientes do Pessoal: % por mês vem do helper compartilhado, sem consulta por cliente', () => {
  const pagina = ler('app/pessoal/clientes/page.tsx')
  assert.ok(pagina.includes("from '@/lib/pessoal-progresso'"), 'usa o helper')
  assert.ok(pagina.includes('buscarTodasTarefasDoAno'), 'uma consulta do ano inteiro')
  assert.doesNotMatch(pagina, /filtrarTarefasVisiveis/, 'regra não duplicada na página')
  assert.doesNotMatch(pagina, /\.from\('tarefas'\)[\s\S]*for \(const c of clientes\)/, 'sem consulta dentro do laço de clientes')
})

test('arquivos tocados: sem texto abaixo de 12px', () => {
  for (const arq of ARQUIVOS_TOCADOS) {
    assert.doesNotMatch(ler(arq), /text-\[(8|9|10|11)px\]/, arq)
  }
})
