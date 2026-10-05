// tests/fase4b-relatorios.test.ts — Relatórios e Tarefas do mês (Fase 4b) sem restos do visual antigo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = ['app/fiscal/relatorios/page.tsx', 'app/fiscal/tarefas/page.tsx']

test('relatórios não tem coluna "#" (tela nem impressão)', () => {
  const src = ler('app/fiscal/relatorios/page.tsx')
  assert.doesNotMatch(src, /<th>#<\/th>/)
  assert.doesNotMatch(src, /<Th[^>]*>\s*#\s*<\/Th>/)
  assert.ok(!src.includes('${i+1}'))
})

test('relatórios mantém Observação, MIT e impressão com escapeHtml', () => {
  const src = ler('app/fiscal/relatorios/page.tsx')
  for (const t of ['Observação', 'MIT', 'escapeHtml(', 'window.open']) assert.ok(src.includes(t), t)
})

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fontes pequenas nem [var(--fg)]`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
  })
  test(`${arq}: tabela dentro de "relative overflow-x-auto"`, () => {
    assert.ok(ler(arq).includes('relative overflow-x-auto'))
  })
}
