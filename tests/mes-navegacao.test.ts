import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MESES, mesVizinho, rotuloMes } from '../lib/mes-navegacao'

test('meses por extenso', () => {
  assert.equal(MESES.length, 12)
  assert.equal(MESES[0], 'Janeiro')
  assert.equal(MESES[8], 'Setembro')
})

test('mês vizinho dentro do ano', () => {
  assert.deepEqual(mesVizinho(9, 2026, 1), { mes: 10, ano: 2026 })
  assert.deepEqual(mesVizinho(9, 2026, -1), { mes: 8, ano: 2026 })
})

test('mês vizinho vira o ano', () => {
  assert.deepEqual(mesVizinho(1, 2026, -1), { mes: 12, ano: 2025 })
  assert.deepEqual(mesVizinho(12, 2026, 1), { mes: 1, ano: 2027 })
})

test('rótulo do mês', () => {
  assert.equal(rotuloMes(9, 2026), 'Setembro 2026')
})

test('seletor usa a ação existente e atualiza a página', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'shell', 'SeletorMes.tsx'), 'utf8')
  assert.match(src, /^'use client'/)
  assert.match(src, /definirMesAno\(/)
  assert.match(src, /router\.refresh\(\)/)
  assert.match(src, /aria-label="Mês de trabalho"/)
  assert.match(src, /rotulo="Mês anterior"/)
  assert.match(src, /rotulo="Próximo mês"/)
})
