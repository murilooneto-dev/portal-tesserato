// tests/links-uteis.test.ts — regras dos links úteis do Início.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hrefDoLink, dominioDoLink, inicialDoLink, validarLink, temErro, linksAlterados, linksAtivos } from '../lib/links-uteis'
import type { LinkRapido } from '../lib/types'

const link = (id: string, titulo: string, url: string, ordem: number, ativo = true): LinkRapido => ({ id, titulo, url, ordem, ativo, logo_url: null })

test('endereço sem protocolo abre como https', () => {
  assert.equal(hrefDoLink('www.gclick.com.br'), 'https://www.gclick.com.br')
  assert.equal(hrefDoLink(' http://iob.com.br '), 'http://iob.com.br')
  assert.equal(dominioDoLink('https://cav.receita.fazenda.gov.br/x'), 'cav.receita.fazenda.gov.br')
  assert.equal(dominioDoLink('nada válido'), '')
  assert.equal(inicialDoLink(' nutror'), 'N')
  assert.equal(inicialDoLink(''), '?')
})

test('validação: nome e endereço obrigatórios; endereço precisa de domínio completo', () => {
  assert.deepEqual(validarLink('', ''), { titulo: 'Informe o nome.', url: 'Informe o endereço.' })
  assert.deepEqual(validarLink('Nutror', 'www.nutror'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('X', 'https://'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('X', 'localhost:3000'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('GClick', 'https://www.gclick.com.br'), {})
  assert.deepEqual(validarLink('Webmail', 'webmail.tesseratocontabilidade.com.br'), {})
  assert.equal(temErro({}), false)
  assert.equal(temErro({ url: 'x' }), true)
})

test('alterados: só o que difere do salvo, sem contar espaços nas pontas', () => {
  const links = [link('a', 'CAV', 'https://cav.gov.br', 0), link('b', 'IOB', 'https://iob.com.br', 1), link('c', 'GClick', 'https://gclick.com.br', 2)]
  const r = linksAlterados(links, {
    a: { titulo: ' CAV ', url: 'https://cav.gov.br' },
    b: { titulo: 'IOB Online', url: 'https://iob.com.br ' },
  })
  assert.deepEqual(r, [{ id: 'b', titulo: 'IOB Online', url: 'https://iob.com.br' }])
})

test('vários editados e um inválido: a validação acha só o errado', () => {
  const links = [link('a', 'A', 'https://a.com.br', 0), link('b', 'B', 'https://b.com.br', 1)]
  const alterados = linksAlterados(links, { a: { titulo: 'A2', url: 'https://a.com.br' }, b: { titulo: 'B', url: 'www.b' } })
  const comErro = alterados.filter(p => temErro(validarLink(p.titulo, p.url))).map(p => p.id)
  assert.deepEqual(comErro, ['b'])
})

test('ativos em ordem', () => {
  const r = linksAtivos([link('b', 'B', 'b.com', 2), link('x', 'X', 'x.com', 0, false), link('a', 'A', 'a.com', 1)])
  assert.deepEqual(r.map(l => l.id), ['a', 'b'])
})
