import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from '../lib/escape-html'

test('escapa os 5 caracteres perigosos de HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;')
  assert.equal(escapeHtml(`O'Brien & Cia`), 'O&#39;Brien &amp; Cia')
})

test('converte número/null/undefined pra string vazia ou literal, sem lançar', () => {
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('texto sem caractere especial não muda', () => {
  assert.equal(escapeHtml('Padaria São José'), 'Padaria São José')
})
