// tests/exclusao-cliente.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  planejarExclusaoNoSetor,
  descreverImpactoExclusao,
  confirmacaoExclusaoValida,
} from '../lib/exclusao-cliente'

// ---------- planejarExclusaoNoSetor ----------

test('planejarExclusaoNoSetor: setor único do cliente => apaga o cliente inteiro', () => {
  const plano = planejarExclusaoNoSetor(['contabil'], 'contabil')
  assert.deepEqual(plano, { removeCliente: true, novosSetores: [] })
})

test('planejarExclusaoNoSetor: cliente em outros setores => só tira o setor e mantém o cliente', () => {
  const plano = planejarExclusaoNoSetor(['fiscal', 'contabil', 'pessoal'], 'contabil')
  assert.deepEqual(plano, { removeCliente: false, novosSetores: ['fiscal', 'pessoal'] })
})

test('planejarExclusaoNoSetor: setor que o cliente não tem não apaga o cliente', () => {
  const plano = planejarExclusaoNoSetor(['fiscal'], 'contabil')
  assert.deepEqual(plano, { removeCliente: false, novosSetores: ['fiscal'] })
})

// ---------- descreverImpactoExclusao ----------

test('descreverImpactoExclusao: remover do setor com o cliente em outros setores => nível setor, sem DELETAR', () => {
  const i = descreverImpactoExclusao({
    origem: 'contabil', acao: 'remover-do-setor', setoresDoCliente: ['fiscal', 'contabil', 'pessoal'],
  })
  assert.equal(i.nivel, 'setor')
  assert.equal(i.exigeDeletar, false)
  assert.equal(i.titulo, 'Remover do Contábil')
  assert.match(i.descricao, /continua em: Fiscal, Pessoal/)
})

test('descreverImpactoExclusao: remover do setor sendo o único setor => vira exclusão total e avisa "inteiro"', () => {
  const i = descreverImpactoExclusao({
    origem: 'pessoal', acao: 'remover-do-setor', setoresDoCliente: ['pessoal'],
  })
  assert.equal(i.nivel, 'total')
  assert.equal(i.exigeDeletar, true)
  assert.equal(i.titulo, 'Excluir cliente')
  assert.match(i.descricao, /sistema inteiro/)
})

test('descreverImpactoExclusao: excluir pelo Fiscal avisa os outros setores que também perdem dados', () => {
  const i = descreverImpactoExclusao({
    origem: 'fiscal', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal', 'contabil', 'pessoal'],
  })
  assert.equal(i.nivel, 'total')
  assert.match(i.descricao, /Contábil, Pessoal/)
  assert.doesNotMatch(i.descricao, /Fiscal,|, Fiscal/)
})

test('descreverImpactoExclusao: excluir pela tela Geral lista todos os setores do cliente', () => {
  const i = descreverImpactoExclusao({
    origem: 'geral', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal', 'contabil'],
  })
  assert.equal(i.nivel, 'total')
  assert.match(i.descricao, /Fiscal, Contábil/)
})

test('descreverImpactoExclusao: exclusão total só em um setor não fala de "outros setores"', () => {
  const i = descreverImpactoExclusao({
    origem: 'fiscal', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal'],
  })
  assert.equal(i.nivel, 'total')
  assert.doesNotMatch(i.descricao, /também/i)
})

test('descreverImpactoExclusao: exclusão total lista o que é perdido', () => {
  const i = descreverImpactoExclusao({
    origem: 'fiscal', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal'],
  })
  assert.ok(i.detalhes.length >= 3)
  assert.ok(i.detalhes.some(d => /tarefas/i.test(d)))
  assert.ok(i.detalhes.some(d => /anexos/i.test(d)))
})

// ---------- confirmacaoExclusaoValida ----------

test('confirmacaoExclusaoValida: nível setor só exige o nome exato', () => {
  assert.equal(confirmacaoExclusaoValida('setor', 'ACME LTDA', 'ACME LTDA', ''), true)
})

test('confirmacaoExclusaoValida: nome diferente (mesmo com maiúsculas trocadas) não confirma', () => {
  assert.equal(confirmacaoExclusaoValida('setor', 'ACME LTDA', 'acme ltda', ''), false)
  assert.equal(confirmacaoExclusaoValida('total', 'ACME LTDA', 'acme ltda', 'DELETAR'), false)
})

test('confirmacaoExclusaoValida: nível total sem a palavra DELETAR não confirma', () => {
  assert.equal(confirmacaoExclusaoValida('total', 'ACME LTDA', 'ACME LTDA', ''), false)
  assert.equal(confirmacaoExclusaoValida('total', 'ACME LTDA', 'ACME LTDA', 'APAGAR'), false)
})

test('confirmacaoExclusaoValida: nível total aceita nome exato e DELETAR em qualquer caixa, ignorando espaços nas pontas', () => {
  assert.equal(confirmacaoExclusaoValida('total', 'ACME LTDA', '  ACME LTDA ', ' deletar '), true)
})

test('confirmacaoExclusaoValida: nome vazio nunca confirma', () => {
  assert.equal(confirmacaoExclusaoValida('setor', 'ACME LTDA', '', ''), false)
})
