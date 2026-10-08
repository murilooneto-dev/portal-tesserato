// tests/ferramentas.test.ts — Ferramentas: só visual, mesmos cartões.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FerramentasClient from '../app/(comum)/ferramentas/FerramentasClient'
import type { ClienteComFiscal } from '../lib/clientes-fiscal'

const cli = (extra: Partial<ClienteComFiscal>) => ({ id: 'c1', nome: 'JOAOZINHO DA MOTOCA', cnpj: '321321321000124', confere_siga: true, envia_iss: false, regime: 'Simples Nacional', responsavel: 'Fiscal', ...extra }) as ClienteComFiscal

test('três cartões fechados, com contagem e sem emojis', () => {
  const html = renderToStaticMarkup(h(FerramentasClient, { clientes: [cli({})], isAdmin: true, userNome: 'Admin' }))
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3)
  for (const t of ['SIGA', 'ISS', 'MEI']) assert.match(html, new RegExp(`>${t}<`))
  assert.match(html, /1 cliente</)
  assert.match(html, /0 clientes</)
  assert.doesNotMatch(html, /🔎|📋|🏪/u)
  assert.match(html, /Acessar TessHub/)
  assert.match(html, /O TessHub abre em uma nova aba/)
  assert.doesNotMatch(html, /text-\[(9|10|11)px\]/)
})

test('cartão DET só aparece para quem é do Pessoal (ou admin), com os clientes do Pessoal', () => {
  const det = [{ id: 'p1', nome: 'EMPRESA DO PESSOAL', cnpj: '11111111000111', responsavel: 'Pessoal' }, { id: 'p2', nome: 'OUTRA', cnpj: null, responsavel: 'Pessoal' }]
  const com = renderToStaticMarkup(h(FerramentasClient, { clientes: [cli({})], clientesDet: det, mostrarDet: true, isAdmin: false, userNome: 'Pessoal' }))
  assert.equal((com.match(/aria-expanded="false"/g) ?? []).length, 4)
  assert.match(com, />DET</)
  assert.match(com, /Domicílio Eletrônico Trabalhista/)
  assert.match(com, /2 clientes</)

  const sem = renderToStaticMarkup(h(FerramentasClient, { clientes: [cli({})], clientesDet: det, isAdmin: false, userNome: 'Fiscal' }))
  assert.equal((sem.match(/aria-expanded="false"/g) ?? []).length, 3)
  assert.doesNotMatch(sem, />DET</)
  assert.doesNotMatch(sem, /Domicílio Eletrônico Trabalhista/)
})
