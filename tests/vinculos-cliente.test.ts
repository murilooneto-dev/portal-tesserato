// tests/vinculos-cliente.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherClienteLeituraVinculos } from '../lib/vinculos-cliente'

const sessao = { tipo: 'sessao' }
const servico = { tipo: 'servico' }
const criarServico = () => servico

test('usuário logado com chave de serviço usa o client de serviço', () => {
  const c = escolherClienteLeituraVinculos({ temUsuario: true, temChaveServico: true, sessao, criarServico })
  assert.equal(c, servico)
})

test('sem chave de serviço cai para o client de sessão', () => {
  const c = escolherClienteLeituraVinculos({ temUsuario: true, temChaveServico: false, sessao, criarServico })
  assert.equal(c, sessao)
})

test('sem usuário autenticado nunca usa o client de serviço', () => {
  let criou = false
  const c = escolherClienteLeituraVinculos({
    temUsuario: false,
    temChaveServico: true,
    sessao,
    criarServico: () => { criou = true; return servico },
  })
  assert.equal(c, sessao)
  assert.equal(criou, false)
})

test('só cria o client de serviço quando vai usá-lo', () => {
  let criou = 0
  escolherClienteLeituraVinculos({ temUsuario: true, temChaveServico: false, sessao, criarServico: () => { criou++; return servico } })
  assert.equal(criou, 0)
})
