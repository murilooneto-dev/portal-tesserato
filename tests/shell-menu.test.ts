import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MenuLateral } from '../components/shell/MenuLateral'
import { ICONE } from '../components/shell/icones-menu'
import { montarMenu, type IconeMenu } from '../lib/navegacao'

const grupos = montarMenu({ role: 'admin', setores: ['fiscal'], paginas_acesso: [] }, 'fiscal')

test('menu com os três grupos e títulos', () => {
  const html = renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/fiscal/clientes' }))
  assert.match(html, /<nav[^>]*aria-label="Menu"/)
  assert.match(html, />Geral</)
  assert.match(html, />Fiscal</)
  assert.match(html, /Lixeira/)
})

test('página atual marcada para leitor de tela', () => {
  const html = renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/fiscal/clientes/abc' }))
  const atual = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
  assert.equal(atual.length, 1)
  assert.match(atual[0], /href="\/fiscal\/clientes"/)
  assert.match(atual[0], /bg-acc-soft/)
})

test('alvo de toque de 44 px na gaveta', () => {
  assert.match(renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/', toque: true })), /h-11/)
  assert.match(renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/' })), /h-\[38px\]/)
})

test('todo ícone do modelo tem desenho', () => {
  const todos: IconeMenu[] = ['inicio', 'cadastro', 'ferramentas', 'dashboard', 'clientes', 'calendario', 'relatorios', 'parcelamentos', 'preenchimento', 'minhas-tarefas', 'procedimentos', 'tabelas', 'recebimentos', 'pagamentos', 'configuracoes', 'vinculos', 'parametros', 'lixeira', 'em-construcao']
  for (const i of todos) assert.ok(ICONE[i], `sem ícone para ${i}`)
})

test('espaço acima dos títulos: primeiro pt-1, demais pt-3.5', () => {
  const html = renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/' }))
  const titulos: string[] = html.match(/<p class="[^"]*uppercase[^"]*">[^<]*<\/p>/g) ?? []
  assert.ok(titulos.length >= 3)
  assert.match(titulos[0]!, /pt-1(?![.\d])/)
  assert.doesNotMatch(titulos[0]!, /pt-3\.5/)
  assert.match(titulos[1]!, />Fiscal</)
  assert.match(titulos[1]!, /pt-3\.5/)
  assert.match(titulos[titulos.length - 1]!, /pt-1(?![.\d])/)
})
