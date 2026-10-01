// tests/design-tokens.test.ts
//
// Garante que as cores do Design System aprovado (artifact SdZ3EYdm8CbusrZnGzz7sV,
// prancheta ds-01-cores) estão em app/globals.css com os valores exatos, que os
// nomes antigos continuam existindo (as telas atuais usam) e que a impressão
// continua em branco e preto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8')

function bloco(seletor: string): string {
  const i = CSS.indexOf(seletor + ' {')
  assert.ok(i >= 0, `bloco "${seletor}" não encontrado em globals.css`)
  const fim = CSS.indexOf('}', i)
  return CSS.slice(i, fim)
}

function valor(blocoCss: string, nome: string): string | undefined {
  const m = blocoCss.match(new RegExp(`--${nome}:\\s*([^;]+);`))
  return m?.[1].trim()
}

const ESCURO: Record<string, string> = {
  page: '#111E3A', surface: '#162444', raised: '#1C2D54', inset: '#0F1A33', nav: '#0D1730', top: '#0B1019',
  fg: '#F2F6FC', 'fg-2': '#B9C6DD', 'fg-3': '#9AABCB', ph: '#8293B5',
  acc: '#00CCEB', 'acc-ink': '#04202B', 'acc-text': '#00CCEB',
  ok: '#34D399', warn: '#FBBF24', danger: '#FF8F8F', 'danger-solid': '#DC2626', info: '#7DB4FF',
}
const CLARO: Record<string, string> = {
  page: '#F4F6FB', surface: '#FFFFFF', raised: '#EEF1F7', inset: '#F8FAFD',
  fg: '#111E3A', 'fg-2': '#33415E', 'fg-3': '#4F5E7E', ph: '#56658A',
  acc: '#00A8C4', 'acc-ink': '#04202B', 'acc-text': '#006B80',
  ok: '#047857', warn: '#92400E', danger: '#B91C1C', 'danger-solid': '#B91C1C', info: '#1D4ED8',
}

test('tema escuro tem as cores do Design System', () => {
  const b = bloco(':root')
  for (const [nome, cor] of Object.entries(ESCURO)) assert.equal(valor(b, nome)?.toUpperCase(), cor, `--${nome}`)
})

test('tema claro tem as cores do Design System', () => {
  const b = bloco(':root.light')
  for (const [nome, cor] of Object.entries(CLARO)) assert.equal(valor(b, nome)?.toUpperCase(), cor, `--${nome}`)
})

test('nomes antigos continuam existindo nos dois temas', () => {
  for (const sel of [':root', ':root.light']) {
    const b = bloco(sel)
    for (const nome of ['bg-page', 'bg-surface', 'bg-surface-2', 'accent', 'accent-hover', 'accent-ink']) {
      assert.ok(valor(b, nome), `${sel} deveria definir --${nome}`)
    }
  }
})

test('as cores viram classes Tailwind via @theme inline', () => {
  const i = CSS.indexOf('@theme inline {')
  assert.ok(i >= 0, '@theme inline não encontrado')
  const b = CSS.slice(i, CSS.indexOf('}', i))
  for (const nome of ['page', 'surface', 'raised', 'inset', 'line', 'line-soft', 'fg', 'fg-2', 'fg-3', 'ph', 'acc', 'acc-ink', 'acc-text', 'acc-soft', 'ok', 'ok-soft', 'warn', 'warn-soft', 'danger', 'danger-soft', 'danger-solid', 'info', 'info-soft', 'neutral-soft']) {
    assert.match(b, new RegExp(`--color-${nome}:\\s*var\\(--${nome}\\);`), `--color-${nome}`)
  }
})

test('remendo de contraste do tema claro continua até as telas migrarem', () => {
  assert.match(CSS, /:root\.light \.text-\\\[var\\\(--fg\\\)\\\]\\\/40/)
})

test('impressão força fundo branco e texto preto também nas variáveis novas', () => {
  const i = CSS.indexOf('@media print')
  assert.ok(i >= 0)
  const b = CSS.slice(i)
  for (const nome of ['page', 'surface', 'raised', 'inset', 'bg-page', 'bg-surface']) assert.match(b, new RegExp(`--${nome}:\\s*#ffffff`, 'i'), `print --${nome}`)
  assert.match(b, /--fg:\s*#000000/i)
})
