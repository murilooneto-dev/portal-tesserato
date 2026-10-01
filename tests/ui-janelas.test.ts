// tests/ui-janelas.test.ts — janelas fecham com Esc e clique no fundo, nunca enquanto salvam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { podeFechar, proximoIndiceDeFoco, abrirNaPilha, fecharNaPilha, estaNoTopo, pilhaVazia } from '../components/ui/overlay'
import { Modal, Drawer } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

const livre = { bloqueado: false, fecharAoClicarFora: true }

test('Esc, fundo e botão fecham quando livre', () => {
  assert.equal(podeFechar('esc', livre), true)
  assert.equal(podeFechar('fundo', livre), true)
  assert.equal(podeFechar('botao', livre), true)
})

test('nada fecha enquanto a janela está salvando', () => {
  const salvando = { bloqueado: true, fecharAoClicarFora: true }
  assert.equal(podeFechar('esc', salvando), false)
  assert.equal(podeFechar('fundo', salvando), false)
  assert.equal(podeFechar('botao', salvando), false)
})

test('clique no fundo pode ser desligado sem desligar o Esc', () => {
  const o = { bloqueado: false, fecharAoClicarFora: false }
  assert.equal(podeFechar('fundo', o), false)
  assert.equal(podeFechar('esc', o), true)
})

test('foco circula dentro da janela com Tab e Shift+Tab', () => {
  assert.equal(proximoIndiceDeFoco(3, 2, false), 0)
  assert.equal(proximoIndiceDeFoco(3, 0, true), 2)
  assert.equal(proximoIndiceDeFoco(3, 1, false), 2)
  assert.equal(proximoIndiceDeFoco(0, 0, false), -1)
})

test('janela fechada não renderiza nada', () => {
  assert.equal(renderToStaticMarkup(h(Modal, { aberto: false, onFechar: () => {}, titulo: 'X' }, 'corpo')), '')
})

test('janela aberta é um diálogo acessível com título, corpo, rodapé e botão de fechar', () => {
  const html = renderToStaticMarkup(
    h(Modal, { aberto: true, onFechar: () => {}, titulo: 'Editar empresa', subtitulo: 'Cliente Fiscal Via Geral', rodape: 'RODAPE' }, 'CORPO'),
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  const idTitulo = html.match(/aria-labelledby="([^"]+)"/)?.[1]
  assert.ok(idTitulo && html.includes(`id="${idTitulo}"`))
  assert.match(html, /Editar empresa/)
  assert.match(html, /CORPO/)
  assert.match(html, /RODAPE/)
  assert.match(html, /aria-label="Fechar \(Esc\)"/)
  assert.match(html, /max-w-\[640px\]/)
})

test('gaveta é um diálogo preso à direita', () => {
  const html = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Editar usuário' }, 'x'))
  assert.match(html, /role="dialog"/)
  assert.match(html, /right-0/)
})

test('confirmação de perigo usa botão vermelho sólido e mostra o efeito', () => {
  const html = renderToStaticMarkup(
    h(ConfirmDialog, {
      aberto: true,
      titulo: 'Excluir cliente?',
      descricao: 'Vai para a Lixeira por 60 dias.',
      textoConfirmar: 'Excluir',
      perigo: true,
      onConfirmar: () => {},
      onCancelar: () => {},
    }),
  )
  assert.match(html, /Excluir cliente\?/)
  assert.match(html, /Lixeira por 60 dias/)
  assert.match(html, /bg-danger-solid[^"]*"[^>]*>Excluir</)
  assert.match(html, />Cancelar</)
})

test('só a janela do topo responde ao teclado', () => {
  const a = Symbol('a'), b = Symbol('b')
  abrirNaPilha(a); abrirNaPilha(b)
  assert.equal(estaNoTopo(b), true)
  assert.equal(estaNoTopo(a), false)
  fecharNaPilha(b)
  assert.equal(estaNoTopo(a), true)
  fecharNaPilha(a)
  assert.equal(pilhaVazia(), true)
})

test('fechar fora de ordem não quebra a pilha', () => {
  const a = Symbol('a'), b = Symbol('b')
  abrirNaPilha(a); abrirNaPilha(b)
  fecharNaPilha(a)
  assert.equal(estaNoTopo(b), true)
  fecharNaPilha(b)
  assert.equal(pilhaVazia(), true)
})

test('botão de fechar não recebe o foco inicial e confirmação foca Cancelar', () => {
  const modal = renderToStaticMarkup(h(Modal, { aberto: true, onFechar: () => {}, titulo: 'X' }, 'x'))
  assert.match(modal, /data-fechar=""/)
  assert.match(modal, /role="dialog"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="dialog"/)
  const conf = renderToStaticMarkup(h(ConfirmDialog, { aberto: true, titulo: 'Excluir?', descricao: 'Vai para a Lixeira.', onConfirmar: () => {}, onCancelar: () => {} }))
  assert.match(conf, /data-autofocus=""[^>]*>Cancelar</)
  const alvo = conf.match(/aria-describedby="([^"]+)"/)?.[1]
  assert.ok(alvo && conf.includes(`id="${alvo}"`))
})
