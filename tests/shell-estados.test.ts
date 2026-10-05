import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import ErroPagina from '../components/shell/ErroPagina'
import NaoEncontrada from '../app/not-found'

const ROOT = join(__dirname, '..')
const AREAS = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro', 'admin', '(comum)']

test('cada área tem erro que reaproveita a peça e nenhuma tem loading.tsx', () => {
  for (const a of AREAS) {
    const l = join(ROOT, 'app', a, 'loading.tsx')
    const e = join(ROOT, 'app', a, 'error.tsx')
    assert.equal(existsSync(l), false, `loading.tsx liga o prefetch do layout (getPortalContext) em todo link — ver ledger da Fase 2 (${l})`)
    assert.ok(existsSync(e), `falta ${e}`)
    const err = readFileSync(e, 'utf8')
    assert.match(err, /^'use client'/)
    assert.match(err, /ErroPagina/)
    assert.match(err, /unstable_retry/)
  }
})

test('erro explica e oferece tentar de novo', () => {
  const html = renderToStaticMarkup(h(ErroPagina, { error: new Error('x'), tentarDeNovo: () => {} }))
  assert.match(html, /Não foi possível abrir esta página/)
  assert.match(html, />Tentar de novo</)
  assert.match(html, /href="\/intranet"/)
})

test('página não encontrada em português, com caminho de volta', () => {
  const html = renderToStaticMarkup(h(NaoEncontrada))
  assert.match(html, /Página não encontrada/)
  assert.match(html, /href="\/intranet"/)
})

test('layout raiz declara o viewport do celular', () => {
  const src = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
  assert.match(src, /export const viewport/)
  assert.match(src, /width:\s*["']device-width["']/)
  assert.match(src, /initialScale:\s*1/)
})
