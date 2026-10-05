// tests/senha.test.ts — regra da nova senha (Redefinir senha).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarNovaSenha, SENHA_MINIMA } from '../lib/senha'

test('menos de 6 caracteres: erro no campo da nova senha', () => {
  assert.equal(SENHA_MINIMA, 6)
  assert.deepEqual(validarNovaSenha('12345', '12345'), { campo: 'nova', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' })
})

test('exatamente 6 e iguais: sem erro', () => {
  assert.equal(validarNovaSenha('123456', '123456'), null)
})

test('diferentes: erro no campo de confirmação (espaço no fim conta)', () => {
  assert.deepEqual(validarNovaSenha('123456', '123456 '), { campo: 'confirmar', mensagem: 'As senhas não são iguais.' })
  assert.deepEqual(validarNovaSenha('abcdef', ''), { campo: 'confirmar', mensagem: 'As senhas não são iguais.' })
})

test('tamanho é conferido antes da igualdade', () => {
  assert.equal(validarNovaSenha('123', '456')?.campo, 'nova')
})
