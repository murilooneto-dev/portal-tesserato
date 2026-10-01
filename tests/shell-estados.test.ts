import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import CarregandoPagina from '../components/shell/CarregandoPagina'
import ErroPagina from '../components/shell/ErroPagina'
import NaoEncontrada from '../app/not-found'

const ROOT = join(__dirname, '..')
const AREAS = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro', 'admin', '(comum)']

test('cada área tem carregando e erro que reaproveitam as peças', () => {
  for (const a of AREAS) {
    const l = join(ROOT, 'app', a, 'loading.tsx')
    const e = join(ROOT, 'app', a, 'error.tsx')
    assert.ok(existsSync(l), `falta ${l}`)
    assert.ok(existsSync(e), `falta ${e}`)
    assert.match(readFileSync(l, 'utf8'), /CarregandoPagina/)
    const err = readFileSync(e, 'utf8')
    assert.match(err, /^'use client'/)
    assert.match(err, /ErroPagina/)
  }
})

test('carregando é anunciado e não é texto solto', () => {
  const html = renderToStaticMarkup(h(CarregandoPagina))
  assert.match(html, /role="status"/)
  assert.match(html, /Carregando/)
  assert.match(html, /animate-pulse/)
})

test('erro explica e oferece tentar de novo', () => {
  const html = renderToStaticMarkup(h(ErroPagina, { error: new Error('x'), reset: () => {} }))
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
