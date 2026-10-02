// tests/ui-basicos.test.ts — peças básicas do Design System (components/ui).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '../components/ui/cn'
import { Button, IconButton } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { MonthPill, tomDoPercentual, normalizarPercentual } from '../components/ui/MonthPill'
import { NomeCliente } from '../components/ui/NomeCliente'

test('cn junta só as partes verdadeiras', () => {
  assert.equal(cn('a', false, null, undefined, 'b'), 'a b')
})

test('botão principal usa texto escuro sobre o ciano', () => {
  const html = renderToStaticMarkup(h(Button, { variante: 'primario' }, 'Salvar'))
  assert.match(html, /bg-acc /)
  assert.match(html, /text-acc-ink/)
  assert.doesNotMatch(html, /text-white|text-fg /)
})

test('botão é type=button por padrão e fica desabilitado carregando', () => {
  const html = renderToStaticMarkup(h(Button, { carregando: true }, 'Salvar'))
  assert.match(html, /type="button"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /aria-busy="true"/)
})

test('botão de ícone sempre tem nome acessível', () => {
  const html = renderToStaticMarkup(h(IconButton, { rotulo: 'Fechar', icone: h('svg') }))
  assert.match(html, /aria-label="Fechar"/)
  assert.match(html, /title="Fechar"/)
})

test('selo usa a cor do tom', () => {
  assert.match(renderToStaticMarkup(h(Badge, { tom: 'dng' }, 'Saída')), /bg-danger-soft text-danger/)
  assert.match(renderToStaticMarkup(h(Badge, { tom: 'ok' }, 'Entrada')), /bg-ok-soft text-ok/)
  assert.match(renderToStaticMarkup(h(Badge, {}, 'x')), /bg-neutral-soft text-fg-2/)
})

test('tom da pílula de mês nas fronteiras', () => {
  assert.equal(tomDoPercentual(0), 'zero')
  assert.equal(tomDoPercentual(1), 'parcial')
  assert.equal(tomDoPercentual(99), 'parcial')
  assert.equal(tomDoPercentual(100), 'completo')
  assert.equal(tomDoPercentual(null), 'vazio')
  assert.equal(tomDoPercentual(undefined), 'vazio')
})

test('percentual fora da faixa é corrigido e NaN vira vazio', () => {
  assert.equal(normalizarPercentual(-5), 0)
  assert.equal(normalizarPercentual(120), 100)
  assert.equal(normalizarPercentual(64.6), 65)
  assert.equal(normalizarPercentual(Number.NaN), null)
  assert.equal(tomDoPercentual(120), 'completo')
  assert.equal(tomDoPercentual(Number.NaN), 'vazio')
})

test('pílula mostra o percentual, o texto acessível e o destaque do mês atual', () => {
  const html = renderToStaticMarkup(h(MonthPill, { percentual: 64, atual: true }))
  assert.match(html, />64%</)
  assert.match(html, /title="64% concluído"/)
  assert.match(html, /bg-warn-soft text-warn/)
  assert.match(html, /ring-2 ring-acc/)
  assert.match(renderToStaticMarkup(h(MonthPill, { percentual: null })), />—</)
})

test('nome do cliente: uma linha, mínimo de 15 caracteres e nome completo no title', () => {
  const nome = 'ANTONIA LUENIA MARTINS TEIXEIRA COMERCIO DE ALIMENTOS E BEBIDAS LTDA ME'
  const html = renderToStaticMarkup(h(NomeCliente, { nome, cnpj: '98.765.432/0001-10' }))
  assert.match(html, /class="[^"]*truncate[^"]*min-w-\[15ch\]/)
  assert.ok(html.includes(`title="${nome}"`))
  assert.match(html, /98\.765\.432\/0001-10/)
})

test('nome do cliente: CNPJ vazio, sem CNPJ, nome vazio e caracteres especiais', () => {
  assert.match(renderToStaticMarkup(h(NomeCliente, { nome: 'A', cnpj: null })), /CNPJ não informado/)
  assert.doesNotMatch(renderToStaticMarkup(h(NomeCliente, { nome: 'A' })), /CNPJ/)
  assert.match(renderToStaticMarkup(h(NomeCliente, { nome: '   ' })), />Sem nome</)
  const html = renderToStaticMarkup(h(NomeCliente, { nome: 'Ribeiro & Filhos Ação' }))
  assert.ok(html.includes('title="Ribeiro &amp; Filhos Ação"'))
  assert.ok(html.includes('>Ribeiro &amp; Filhos Ação<'))
})

test('nome do cliente aceita conteúdo logo depois do nome (P1, observação)', () => {
  const html = renderToStaticMarkup(h(NomeCliente, { nome: 'Cliente', depoisDoNome: h(Badge, { tom: 'dng' }, 'P1') }))
  assert.ok(html.indexOf('Cliente') < html.indexOf('P1'))
})

test('NomeCliente aguenta nome nulo e CNPJ só com espaços', () => {
  const a = renderToStaticMarkup(h(NomeCliente, { nome: null as unknown as string }))
  assert.ok(a.includes('>Sem nome<'))
  const b = renderToStaticMarkup(h(NomeCliente, { nome: 'Acme', cnpj: '   ' }))
  assert.ok(b.includes('CNPJ não informado'))
})

test('Badge mantém a altura de linha 1 depois do tamanho da fonte', () => {
  const html = renderToStaticMarkup(h(Badge, { tom: 'ok', children: 'Pago' }))
  assert.match(html, /text-xs leading-none/)
  assert.match(renderToStaticMarkup(h(Badge, { grande: true, children: 'Pago' })), /text-\[13px\] leading-none/)
})
