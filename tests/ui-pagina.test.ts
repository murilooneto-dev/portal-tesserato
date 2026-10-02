// tests/ui-pagina.test.ts — moldura da página, segmentado e chip.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pagina, CabecalhoPagina } from '../components/ui/Pagina'
import { Segmentado } from '../components/ui/Segmentado'
import { Chip } from '../components/ui/Chip'

const nada = () => {}

test('Pagina: respiro do celular e do desktop', () => {
  const html = renderToStaticMarkup(h(Pagina, null, 'x'))
  assert.match(html, /px-4/)
  assert.match(html, /sm:px-8/)
  assert.match(html, /gap-5/)
})

test('CabecalhoPagina: título h1, subtítulo e ações fora da impressão', () => {
  const html = renderToStaticMarkup(h(CabecalhoPagina, { titulo: 'Início', subtitulo: 'Sua agenda', acoes: h('button', null, 'Novo') }))
  assert.match(html, /<h1[^>]*>Início<\/h1>/)
  assert.match(html, /<p[^>]*>Sua agenda<\/p>/)
  assert.match(html, /print:hidden[^>]*><button>Novo<\/button>/)
  assert.doesNotMatch(renderToStaticMarkup(h(CabecalhoPagina, { titulo: 'X' })), /print:hidden/)
})

test('Segmentado: grupo de rádio com uma opção marcada e só ela no Tab', () => {
  const html = renderToStaticMarkup(h(Segmentado, {
    rotulo: 'Situação',
    opcoes: [{ valor: 'pendente', rotulo: 'Pendente' }, { valor: 'concluido', rotulo: 'Concluído' }, { valor: 'cancelado', rotulo: 'Cancelado' }],
    valor: 'concluido',
    onMudar: nada,
  }))
  assert.match(html, /role="radiogroup"[^>]*aria-label="Situação"|aria-label="Situação"[^>]*role="radiogroup"/)
  assert.equal((html.match(/role="radio"/g) ?? []).length, 3)
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1)
  assert.match(html, /aria-checked="true"[^>]*tabindex="0"[^>]*>Concluído|tabindex="0"[^>]*aria-checked="true"[^>]*>Concluído/)
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 2)
})

test('Chip: aria-pressed e marca de seleção só quando ativo', () => {
  const on = renderToStaticMarkup(h(Chip, { ativo: true, onClick: nada }, 'Fiscal'))
  const off = renderToStaticMarkup(h(Chip, { ativo: false, onClick: nada }, 'Fiscal'))
  assert.match(on, /aria-pressed="true"/)
  assert.match(on, /<svg/)
  assert.match(off, /aria-pressed="false"/)
  assert.doesNotMatch(off, /<svg/)
  assert.match(off, /type="button"/)
})

test('Segmentado: valor inexistente deixa a primeira opção no Tab', () => {
  const html = renderToStaticMarkup(h(Segmentado, {
    rotulo: 'Situação',
    opcoes: [{ valor: 'a', rotulo: 'A' }, { valor: 'b', rotulo: 'B' }],
    valor: 'zzz',
    onMudar: nada,
  }))
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1)
  assert.match(html, /tabindex="0"[^>]*>A</)
})
