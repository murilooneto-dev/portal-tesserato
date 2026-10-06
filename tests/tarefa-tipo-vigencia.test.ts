// tests/tarefa-tipo-vigencia.test.ts — tarefa nova só conta a partir do mês em que foi criada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularTarefasEsperadas, tarefaVigenteNoPeriodo, type MapaVinculosSetor } from '../lib/tarefas-esperadas'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

test('tarefaVigenteNoPeriodo: vale do mês de criação em diante; sem data vale sempre', () => {
  const criada = '2026-10-06T14:31:09Z'
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 9, ano: 2026 }), false)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 10, ano: 2026 }), true)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 1, ano: 2027 }), true)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 12, ano: 2025 }), false)
  for (const semData of [null, undefined, '', 'lixo']) assert.equal(tarefaVigenteNoPeriodo(semData, { mes: 1, ano: 2020 }), true)
})

test('tarefaVigenteNoPeriodo: o mês de criação é o de São Paulo, não o UTC', () => {
  // 01/11 01:30 UTC ainda é 31/10 22:30 em São Paulo.
  assert.equal(tarefaVigenteNoPeriodo('2026-11-01T01:30:00Z', { mes: 10, ano: 2026 }), true)
  // 01/11 04:00 UTC já é 01/11 01:00 em São Paulo.
  assert.equal(tarefaVigenteNoPeriodo('2026-11-01T04:00:00Z', { mes: 10, ano: 2026 }), false)
})

const mapa: MapaVinculosSetor = {
  porRegime: {},
  porAtividade: { Comércio: [{ tarefa: 'Conferência Folha', regimeNome: null }, { tarefa: 'Folha', regimeNome: null }] },
  inicioPorTarefa: { 'Conferência Folha': '2026-10-06T14:31:09Z', 'Nova do cliente': '2026-10-06T12:00:00Z' },
}
const cliente = { regime: null, atividade: ['Comércio'], tarefas_personalizadas: ['Antiga', 'Nova do cliente'] }

test('calcularTarefasEsperadas: tarefa criada em outubro não aparece em setembro (automática e do cliente)', () => {
  assert.deepEqual(calcularTarefasEsperadas(cliente, mapa, { mes: 9, ano: 2026 }).sort(), ['Antiga', 'Folha'])
  assert.deepEqual(calcularTarefasEsperadas(cliente, mapa, { mes: 10, ano: 2026 }).sort(), ['Antiga', 'Conferência Folha', 'Folha', 'Nova do cliente'])
})

test('calcularTarefasEsperadas: sem período devolve tudo (cadastro); período do mapa vale quando não vem outro', () => {
  assert.equal(calcularTarefasEsperadas(cliente, mapa).length, 4)
  const mapaDeSetembro = { ...mapa, periodo: { mes: 9, ano: 2026 } }
  assert.deepEqual(calcularTarefasEsperadas(cliente, mapaDeSetembro).sort(), ['Antiga', 'Folha'])
  assert.equal(calcularTarefasEsperadas(cliente, mapaDeSetembro, { mes: 11, ano: 2026 }).length, 4)
  // mapa antigo, sem as datas: nada muda
  assert.equal(calcularTarefasEsperadas(cliente, { porRegime: {}, porAtividade: mapa.porAtividade }, { mes: 1, ano: 2020 }).length, 4)
})

const TELAS_DE_UM_MES: [string, string][] = [
  ['app/fiscal/clientes/page.tsx', 'fiscal'], ['app/fiscal/clientes/[id]/page.tsx', 'fiscal'], ['app/fiscal/dashboard/page.tsx', 'fiscal'],
  ['app/fiscal/minhas-tarefas/page.tsx', 'fiscal'], ['app/fiscal/preenchimento-rapido/page.tsx', 'fiscal'], ['app/fiscal/relatorios/page.tsx', 'fiscal'],
  ['app/api/relatorios/fiscal/route.ts', 'fiscal'],
  ['app/contabil/clientes/page.tsx', 'contabil'], ['app/contabil/clientes/[id]/page.tsx', 'contabil'], ['app/contabil/dashboard/page.tsx', 'contabil'],
  ['app/contabil/preenchimento-rapido/page.tsx', 'contabil'], ['app/contabil/relatorios/page.tsx', 'contabil'],
  ['app/pessoal/clientes/page.tsx', 'pessoal'], ['app/pessoal/clientes/[id]/page.tsx', 'pessoal'], ['app/pessoal/dashboard/page.tsx', 'pessoal'],
  ['app/pessoal/preenchimento-rapido/page.tsx', 'pessoal'], ['app/pessoal/relatorios/page.tsx', 'pessoal'],
]

for (const [arq, setor] of TELAS_DE_UM_MES) {
  test(`${arq}: busca o mapa de vínculos com o mês da tela`, () => {
    assert.match(ler(arq), new RegExp(`buscarMapaVinculosSetor\\(\\w+, '${setor}', \\{ mes, ano \\}\\)`))
  })
}

test('cadastro de cliente continua sem mês: grava e registra a lista inteira', () => {
  for (const arq of ['app/fiscal/clientes/actions.ts', 'app/contabil/clientes/actions.ts', 'app/pessoal/clientes/actions.ts', 'app/(comum)/clientes/actions.ts', 'components/geral/TarefasAutomaticasCampo.tsx']) {
    assert.ok(!ler(arq).includes('{ mes, ano })'), arq)
  }
})

test('faixa do ano (Contábil e Pessoal) calcula as esperadas de cada mês', () => {
  assert.ok(ler('app/contabil/clientes/page.tsx').includes('calcularTarefasEsperadas(c, mapaVinculos, { mes: m, ano })'))
  assert.ok(ler('app/contabil/clientes/[id]/page.tsx').includes('calcularTarefasEsperadas(cliente, mapaVinculos, { mes: m, ano })'))
  assert.ok(ler('app/pessoal/clientes/[id]/page.tsx').includes('calcularTarefasEsperadas(cliente, mapaVinculos, { mes: m, ano })'))
  assert.ok(ler('components/contabil/ClientesListaContabil.tsx').includes('prog?.totalPorMes[mesNum]'))
})

test('migration 063: coluna nula para os tipos antigos, default now() e data real pelo log', () => {
  const sql = ler('supabase/migrations/063_tarefa_tipos_criado_em.sql')
  assert.ok(sql.includes('add column criado_em timestamptz;'))
  assert.ok(sql.includes('alter column criado_em set default now()'))
  assert.ok(sql.includes("detalhes::jsonb->>'entidade' = 'Tipo de tarefa'"))
})
