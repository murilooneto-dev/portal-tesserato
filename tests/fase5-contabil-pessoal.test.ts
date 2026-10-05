// tests/fase5-contabil-pessoal.test.ts — varredura da Fase 5 (Contábil e Pessoal) do redesign.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const arquivosDe = (dir: string) =>
  readdirSync(join(process.cwd(), dir)).filter(f => f.endsWith('.tsx') || f.endsWith('.ts')).map(f => `${dir}/${f}`)

const TELAS_CONTABIL_PESSOAL = [
  ...arquivosDe('components/contabil'),
  ...arquivosDe('components/pessoal'),
]

test('Contábil e Pessoal: sem texto abaixo de 12px (text-[8|9|10|11px])', () => {
  for (const arq of TELAS_CONTABIL_PESSOAL) {
    assert.doesNotMatch(ler(arq), /text-\[(8|9|10|11)px\]/, arq)
  }
})

test('telas novas e alteradas: sem confirm() nem alert()', () => {
  const telas = [
    'components/contabil/ClientesListaContabil.tsx',
    'components/contabil/SeletorMesFicha.tsx',
    'components/contabil/TarefaChecklistContabil.tsx',
    'components/contabil/RelatoriosContabil.tsx',
    'components/pessoal/RelatoriosPessoal.tsx',
  ]
  for (const arq of telas) {
    const src = ler(arq)
    assert.doesNotMatch(src, /(^|[^.\w])confirm\(/m, arq)
    assert.doesNotMatch(src, /(^|[^.\w])alert\(/m, arq)
  }
})

test('Clientes do Contábil: opção B (faixa de 12 meses, cores 0/parcial/100, mês atual com contorno)', () => {
  const src = ler('components/contabil/ClientesListaContabil.tsx')
  assert.ok(src.includes('grid-cols-12'), 'faixa de 12 colunas')
  assert.ok(src.includes('COR[tomDoPercentual(pct)]'), 'cores pelo tom do percentual')
  assert.ok(src.includes('var(--acc)'), 'contorno do mês atual')
  assert.ok(src.includes('aria-current'), 'mês atual marcado')
  assert.ok(src.includes('MESES.map'), 'ano inteiro sempre visível')
})

test('Clientes do Contábil: nome pelo componente comum e largura da faixa com rolagem contida', () => {
  const src = ler('components/contabil/ClientesListaContabil.tsx')
  assert.ok(src.includes("from '@/components/ui/NomeCliente'"), 'NomeCliente')
  assert.ok(src.includes('overflow-x-auto'), 'faixa dentro de contêiner com overflow-x-auto')
  assert.ok(src.includes('P{cliente.prioridade}'), 'Contábil mantém a prioridade P1')
})

test('Ficha do Contábil: seletor de mês no título das tarefas', () => {
  const seletor = ler('components/contabil/SeletorMesFicha.tsx')
  assert.ok(seletor.includes('Mês das tarefas'), 'grupo com rótulo')
  assert.ok(seletor.includes('aria-label="Mês anterior"') && seletor.includes('aria-label="Próximo mês"'), 'setas ‹ ›')
  assert.ok(seletor.includes('?mes=${m}&ano=${a}'), 'troca de mês pelo parâmetro ?mes&ano que a ficha já usa')
  assert.ok(seletor.includes('Andamento de'), 'quadro com os 12 meses')

  const checklist = ler('components/contabil/TarefaChecklistContabil.tsx')
  assert.ok(checklist.includes('seletorMes'), 'checklist aceita o seletor no cabeçalho')

  const pagina = ler('app/contabil/clientes/[id]/page.tsx')
  assert.ok(pagina.includes("import SeletorMesFicha from '@/components/contabil/SeletorMesFicha'"))
  assert.ok(pagina.includes('progressoFicha'), '% por mês calculado na página')
  assert.ok(pagina.includes('seletorMes={<SeletorMesFicha'), 'seletor ligado no checklist')
})

test('Ficha do Contábil: mês sai da barra do topo só nessa tela', () => {
  const shell = ler('components/shell/ShellCliente.tsx')
  assert.ok(shell.includes('/^\\/(contabil|pessoal)\\/clientes\\/[^/]+$/'), 'regra da rota da ficha (Contábil e Pessoal)')
  assert.ok(shell.includes('fichaContabil ? null : <SeletorMes'), 'SeletorMes oculto na ficha')
})

test('Ficha do Pessoal: seletor de mês reaproveitado do Contábil, com ?mes&ano', () => {
  const pagina = ler('app/pessoal/clientes/[id]/page.tsx')
  assert.ok(pagina.includes("import SeletorMesFicha from '@/components/contabil/SeletorMesFicha'"), 'mesmo seletor')
  assert.ok(pagina.includes('searchParams: Promise<{ mes?: string; ano?: string }>'), 'aceita ?mes&ano')
  assert.ok(pagina.includes('const { mes, ano } = override ?? await getMesAno()'), 'mês da ficha vem do parâmetro')
  assert.ok(pagina.includes('progressoFicha'), '% por mês calculado na página')
  assert.ok(pagina.includes('seletorMes={<SeletorMesFicha'), 'seletor ligado no checklist')
  assert.ok(pagina.includes('basePath={`/pessoal/clientes/${id}`}'), 'troca de mês volta para a ficha do Pessoal')

  const checklist = ler('components/pessoal/TarefaChecklistPessoal.tsx')
  assert.ok(checklist.includes('seletorMes'), 'checklist aceita o seletor no cabeçalho')
})

test('Dashboards do Contábil e do Pessoal: Setor | Meu com DashboardVisao e calcularMeu', () => {
  const visao = ler('components/fiscal/DashboardVisao.tsx')
  assert.ok(visao.includes("base = '/fiscal/dashboard'"), 'Fiscal continua como padrão')
  assert.ok(visao.includes('`${base}?visao=meu`'), 'Meu usa a rota do setor')

  for (const [arq, base] of [
    ['app/contabil/dashboard/page.tsx', '/contabil/dashboard'],
    ['app/pessoal/dashboard/page.tsx', '/pessoal/dashboard'],
  ] as const) {
    const src = ler(arq)
    assert.ok(src.includes(`base="${base}"`), `${arq} passa a própria rota`)
    assert.ok(src.includes("from '@/lib/dashboard-meu'"), `${arq} usa o modo Meu compartilhado`)
    assert.ok(src.includes('calcularMeu({'), `${arq} calcula o modo Meu`)
    assert.ok(src.includes('Próximos prazos'), `${arq} com o cartão de prazos`)
    assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/, arq)
  }
})

test('Relatórios do Contábil e do Pessoal: sem coluna "#"', () => {
  for (const arq of ['components/contabil/RelatoriosContabil.tsx', 'components/pessoal/RelatoriosPessoal.tsx']) {
    const src = ler(arq)
    assert.doesNotMatch(src, /<th>#<\/th>/, arq)
    assert.doesNotMatch(src, /'#',\s*'Cliente'/, arq)
    assert.ok(!src.includes('${i+1}'), arq)
    assert.ok(!src.includes('{i+1}'), arq)
    assert.ok(src.includes("'Cliente'") && src.includes("'MIT'"), `${arq} mantém as demais colunas`)
  }
})

test('tabelas de Relatórios continuam em contêiner com rolagem contida', () => {
  for (const arq of ['components/contabil/RelatoriosContabil.tsx', 'components/pessoal/RelatoriosPessoal.tsx']) {
    assert.ok(ler(arq).includes('overflow-x-auto'), arq)
  }
})
