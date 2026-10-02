// tests/cliente-geral-janelas.test.ts — janelas do cadastro de cliente no Modal comum.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ConfirmarExclusaoClienteModal from '../components/geral/ConfirmarExclusaoClienteModal'
import DesabilitarClienteModal from '../components/geral/DesabilitarClienteModal'
import NovoTipoTarefaModal from '../components/geral/NovoTipoTarefaModal'
import { descreverImpactoExclusao } from '../lib/exclusao-cliente'

const ROOT = join(__dirname, '..')
const nada = () => {}
const assincrono = async () => ({ error: null })

test('as janelas que abrem por cima da janela de cliente usam o Modal comum', () => {
  for (const arq of ['ClienteGeralModal', 'ConfirmarExclusaoClienteModal', 'DesabilitarClienteModal', 'NovoTipoTarefaModal']) {
    const fonte = readFileSync(join(ROOT, 'components', 'geral', `${arq}.tsx`), 'utf8')
    assert.match(fonte, /from '@\/components\/ui\/Modal'/, arq)
    assert.doesNotMatch(fonte, /fixed inset-0/, arq)
    assert.doesNotMatch(fonte, /\bconfirm\(/, arq)
  }
})

test('excluir do sistema: pede nome e DELETAR, botão começa desabilitado', () => {
  const impacto = descreverImpactoExclusao({ origem: 'geral', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal'] })
  const html = renderToStaticMarkup(h(ConfirmarExclusaoClienteModal, { nomeCliente: 'Empresa Teste', impacto, onConfirmar: assincrono, onCancelar: nada }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /Empresa Teste/)
  assert.match(html, /DELETAR/)
  const botao = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${impacto.rotuloBotao}`))?.[0] ?? ''
  assert.match(botao, /disabled=""/)
})

test('desabilitar: nome e senha de login, senha oculta, botão desabilitado', () => {
  const html = renderToStaticMarkup(h(DesabilitarClienteModal, { clienteNome: 'Empresa Teste', onClose: nada, onConfirm: async () => ({}), onConfirmado: nada }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /type="password"/)
  const botao = html.match(/<button[^>]*>(?:(?!<\/button>).)*Desabilitar cliente/)?.[0] ?? ''
  assert.match(botao, /disabled=""/)
})

test('janela do cliente não tem mais a seção Dados do Fiscal', () => {
  const fonte = readFileSync(join(ROOT, 'components', 'geral', 'ClienteGeralModal.tsx'), 'utf8')
  assert.doesNotMatch(fonte, /Dados do Fiscal/)
  assert.doesNotMatch(fonte, /<CamposFiscais/)
})
