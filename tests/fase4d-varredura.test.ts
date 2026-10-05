// tests/fase4d-varredura.test.ts — Varredura da Fase 4d (Tabelas) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = [
  'components/tabelas/TabelasLista.tsx',
  'components/tabelas/TabelaDetalhe.tsx',
  'components/tabelas/TabelaEditavel.tsx',
  'components/tabelas/BarraConsulta.tsx',
  'components/tabelas/NovaTabelaWizard.tsx',
  'components/tabelas/GerenciarEstrutura.tsx',
  'components/tabelas/ReenviarPlanilhaWizard.tsx',
]

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fontes pequenas, [var(--fg)] nem confirm() do navegador`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /(^|[^.\w])confirm\(/)
  })
}

test('janelas de tabela usam Modal ou Drawer do componente comum (sem overlay próprio)', () => {
  for (const arq of ['components/tabelas/NovaTabelaWizard.tsx', 'components/tabelas/GerenciarEstrutura.tsx', 'components/tabelas/ReenviarPlanilhaWizard.tsx']) {
    assert.match(ler(arq), /from '@\/components\/ui\/Modal'/, arq)
    assert.doesNotMatch(ler(arq), /fixed inset-0/, arq)
  }
})

test('nenhum componente de tabela usa resize de coluna', () => {
  for (const arq of ARQUIVOS) assert.doesNotMatch(ler(arq), /resize-(x|y|both)/, arq)
})

test('a camada de lógica (lib/tabelas-*) continua sendo importada pelos componentes', () => {
  const usos = ler('components/tabelas/TabelaEditavel.tsx') + ler('components/tabelas/TabelaDetalhe.tsx') + ler('components/tabelas/NovaTabelaWizard.tsx')
  assert.ok(usos.includes("from '@/lib/tabelas"), 'componentes deixaram de usar a lógica de lib/tabelas')
})
