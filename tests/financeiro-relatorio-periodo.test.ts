import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mesCorrenteSP, periodoDoRelatorio } from '../lib/financeiro-relatorio-periodo'

test('mês corrente: primeiro e último dia, no relógio de São Paulo', () => {
  assert.deepEqual(mesCorrenteSP(new Date('2026-10-09T15:00:00Z')), { de: '2026-10-01', ate: '2026-10-31' })
  assert.deepEqual(mesCorrenteSP(new Date('2028-02-10T12:00:00Z')), { de: '2028-02-01', ate: '2028-02-29' })
  // 1º de novembro 01h UTC ainda é 31 de outubro em São Paulo.
  assert.deepEqual(mesCorrenteSP(new Date('2026-11-01T01:00:00Z')), { de: '2026-10-01', ate: '2026-10-31' })
})

test('sem filtro na URL abre no mês corrente; com filtro vale o escolhido', () => {
  const hoje = new Date('2026-10-09T15:00:00Z')
  assert.deepEqual(periodoDoRelatorio({}, hoje), { de: '2026-10-01', ate: '2026-10-31' })
  assert.deepEqual(periodoDoRelatorio({ de: '', ate: '' }, hoje), { de: '2026-10-01', ate: '2026-10-31' })
  assert.deepEqual(periodoDoRelatorio({ de: '2026-08-01', ate: '2026-08-31' }, hoje), { de: '2026-08-01', ate: '2026-08-31' })
  assert.deepEqual(periodoDoRelatorio({ natureza: 'saida' }, hoje), { de: undefined, ate: undefined })
})

test('a página usa o período padrão', () => {
  const src = readFileSync(join(process.cwd(), 'app/financeiro/relatorios/page.tsx'), 'utf-8')
  assert.match(src, /periodoDoRelatorio\(/)
})
