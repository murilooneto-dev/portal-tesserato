// tests/ui-cn-gaveta.test.ts — merge de classes e gaveta pela esquerda.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '../components/ui/cn'
import { Drawer } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

test('cn: a última classe em conflito vence', () => {
  assert.equal(cn('h-9 px-3', 'h-11'), 'px-3 h-11')
  assert.equal(cn('text-sm', false, 'text-[15px]'), 'text-[15px]')
  assert.equal(cn('a', null, undefined, 'b'), 'a b')
})

test('className do chamador vence a altura padrão do botão', () => {
  const html = renderToStaticMarkup(h(Button, { className: 'h-11' }, 'Ok'))
  assert.match(html, /\bh-11\b/)
  assert.doesNotMatch(html, /\bh-9\b/)
})

test('gaveta abre pela esquerda quando pedido', () => {
  const esq = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Menu', lado: 'esquerda' }, 'x'))
  assert.match(esq, /left-0/)
  assert.match(esq, /border-r/)
  assert.doesNotMatch(esq, /right-0/)
  const dir = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Editar' }, 'x'))
  assert.match(dir, /right-0/)
})
