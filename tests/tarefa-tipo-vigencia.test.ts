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
  ['lib/relatorio-fiscal-envio.ts', 'fiscal'],
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

// ---------- encerramento (migration 064) ----------

test('tarefaVigenteNoPeriodo: tarefa encerrada conta até o mês do encerramento e some depois', () => {
  const fim = '2026-09-01'
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 8, ano: 2026 }, fim), true)
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 9, ano: 2026 }, fim), true)
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 10, ano: 2026 }, fim), false)
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 1, ano: 2027 }, fim), false)
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 12, ano: 2025 }, fim), true)
  // qualquer dia do mês vale o mês inteiro, sem escorregar por fuso
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 9, ano: 2026 }, '2026-09-30'), true)
  assert.equal(tarefaVigenteNoPeriodo(null, { mes: 10, ano: 2026 }, '2026-09-30'), false)
  for (const semFim of [null, undefined, '', 'lixo']) assert.equal(tarefaVigenteNoPeriodo(null, { mes: 1, ano: 2099 }, semFim), true)
})

test('tarefaVigenteNoPeriodo: começo e fim juntos delimitam a janela', () => {
  const criada = '2026-03-10T12:00:00Z'
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 2, ano: 2026 }, '2026-09-01'), false)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 3, ano: 2026 }, '2026-09-01'), true)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 9, ano: 2026 }, '2026-09-01'), true)
  assert.equal(tarefaVigenteNoPeriodo(criada, { mes: 10, ano: 2026 }, '2026-09-01'), false)
})

test('calcularTarefasEsperadas: tarefa encerrada em setembro some de outubro, do cliente e automática', () => {
  const mapaFim: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: { Comércio: [{ tarefa: 'Emissão de Folhas', regimeNome: null }, { tarefa: 'Automática antiga', regimeNome: null }] },
    fimPorTarefa: { 'Folha de Pagamento': '2026-09-01', 'Automática antiga': '2026-09-01' },
  }
  const c = { regime: null, atividade: ['Comércio'], tarefas_personalizadas: ['Folha de Pagamento', '13º Salário'] }
  assert.deepEqual(calcularTarefasEsperadas(c, mapaFim, { mes: 9, ano: 2026 }).sort(), ['13º Salário', 'Automática antiga', 'Emissão de Folhas', 'Folha de Pagamento'])
  assert.deepEqual(calcularTarefasEsperadas(c, mapaFim, { mes: 10, ano: 2026 }).sort(), ['13º Salário', 'Emissão de Folhas'])
  // cadastro do cliente (sem mês): a lista inteira continua lá
  assert.equal(calcularTarefasEsperadas(c, mapaFim).length, 4)
})

test('migration 064 e leitura do encerramento', () => {
  assert.ok(ler('supabase/migrations/064_tarefa_tipos_vigente_ate.sql').includes('add column if not exists vigente_ate date'))
  const lib = ler('lib/tarefas-esperadas.ts')
  assert.ok(lib.includes("select('nome, criado_em, vigente_ate')"))
  assert.ok(lib.includes("or('criado_em.not.is.null,vigente_ate.not.is.null')"))
})

test('tipo encerrado não entra na lista padrão de cliente novo (Pessoal e Contábil)', () => {
  for (const arq of ['app/pessoal/clientes/page.tsx', 'app/pessoal/clientes/[id]/page.tsx', 'app/contabil/clientes/page.tsx', 'app/contabil/clientes/[id]/page.tsx']) {
    assert.ok(ler(arq).includes('.filter(t => !t.vigente_ate).map(t => t.nome as string)'), arq)
  }
})

test('cadastro geral: cliente novo não recebe tipo padrão já encerrado', () => {
  const src = ler('app/(comum)/clientes/actions.ts')
  assert.equal(src.split(".eq('padrao', true).is('vigente_ate', null)").length - 1, 4)
  assert.ok(!/\.eq\('padrao', true\)\.order/.test(src))
})
