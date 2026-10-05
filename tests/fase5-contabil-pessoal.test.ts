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
  assert.ok(shell.includes('/^\\/contabil\\/clientes\\/[^/]+$/'), 'regra da rota da ficha')
  assert.ok(shell.includes('fichaContabil ? null : <SeletorMes'), 'SeletorMes oculto na ficha')
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
