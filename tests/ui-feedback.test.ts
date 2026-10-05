// tests/ui-feedback.test.ts — avisos, cartão, tabela, vazio e fila de "salvo".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Card } from '../components/ui/Card'
import { Aviso } from '../components/ui/Aviso'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabela, Th, Td } from '../components/ui/Tabela'
import { filaDeAvisos, type AvisoSalvo } from '../components/ui/Toast'
import * as ui from '../components/ui'

test('cartão com título, selo e ações', () => {
  const html = renderToStaticMarkup(h(Card, { titulo: 'Tarefas de setembro', meta: 'META', acoes: 'ACOES' }, 'CORPO'))
  assert.match(html, /<h2[^>]*>Tarefas de setembro<\/h2>/)
  assert.ok(html.indexOf('META') < html.indexOf('ACOES'))
  assert.match(html, /bg-surface/)
})

test('aviso usa a cor do tom e tem ícone escondido do leitor', () => {
  const html = renderToStaticMarkup(h(Aviso, { tom: 'warn' }, 'Este cliente possui parcelamento'))
  assert.match(html, /bg-warn-soft/)
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /Este cliente possui parcelamento/)
})

test('estado vazio explica e oferece ação', () => {
  const html = renderToStaticMarkup(h(EmptyState, { icone: h('svg'), titulo: 'Nenhum evento', descricao: 'Registre aqui', acao: h('button', null, 'Novo evento') }))
  assert.match(html, /Nenhum evento/)
  assert.match(html, /Registre aqui/)
  assert.match(html, /Novo evento/)
})

test('tabela com cabeçalho e alinhamento', () => {
  const html = renderToStaticMarkup(
    h(Tabela, null,
      h('thead', null, h('tr', null, h(Th, { largura: 120 }, 'Valor'))),
      h('tbody', null, h('tr', null, h(Td, { alinhar: 'dir' }, 'R$ 250,00')))),
  )
  assert.match(html, /<table/)
  assert.match(html, /style="width:120px"/)
  assert.match(html, /text-right/)
})

test('fila de avisos guarda no máximo 3, os mais novos', () => {
  let fila: AvisoSalvo[] = []
  for (let i = 1; i <= 4; i++) fila = filaDeAvisos(fila, { tipo: 'adicionar', aviso: { id: i, texto: `a${i}`, tom: 'ok' } })
  assert.deepEqual(fila.map(a => a.id), [2, 3, 4])
  fila = filaDeAvisos(fila, { tipo: 'remover', id: 3 })
  assert.deepEqual(fila.map(a => a.id), [2, 4])
})

test('index reexporta as peças', () => {
  for (const nome of ['Button', 'IconButton', 'Badge', 'MonthPill', 'NomeCliente', 'Field', 'Input', 'Select', 'Textarea', 'Checkbox', 'Switch', 'Modal', 'Drawer', 'ConfirmDialog', 'useConfirmar', 'Card', 'Aviso', 'EmptyState', 'Tabela', 'Th', 'Td', 'useToast', 'Providers']) {
    assert.ok((ui as Record<string, unknown>)[nome], `components/ui não exporta ${nome}`)
  }
})

test('layout raiz monta os providers de confirmação e aviso', () => {
  const layout = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')
  assert.match(layout, /<Providers>\s*\{children\}\s*<\/Providers>/)
})

test('região de avisos fica acima de qualquer janela (z-[80])', () => {
  assert.ok(readFileSync(join(process.cwd(), 'components/ui/Toast.tsx'), 'utf8').includes('z-[80]'))
})
