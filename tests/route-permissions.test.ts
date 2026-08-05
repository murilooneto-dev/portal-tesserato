// tests/route-permissions.test.ts
//
// Replica o PoC das duas revisões rejeitadas: um usuário autenticado só do
// setor Fiscal não pode ser considerado autorizado no setor Financeiro,
// não importa como esse "financeiro" chegue até a checagem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSetorPagina, podeAcessarSetor, podeAcessarPagina } from '../lib/route-permissions'
import type { UserSetor } from '../lib/types'

const usuarioFiscal = { role: 'operador', setores: ['fiscal'] as UserSetor[], paginas_acesso: [] as string[] }
const usuarioAdmin = { role: 'admin', setores: [] as UserSetor[], paginas_acesso: [] as string[] }

test('usuário só do setor Fiscal não pode acessar Financeiro', () => {
  assert.equal(podeAcessarSetor(usuarioFiscal, 'financeiro'), false)
})

test('usuário só do setor Fiscal pode acessar o próprio setor Fiscal', () => {
  assert.equal(podeAcessarSetor(usuarioFiscal, 'fiscal'), true)
})

test('admin pode acessar qualquer setor mesmo sem estar na lista de setores', () => {
  assert.equal(podeAcessarSetor(usuarioAdmin, 'financeiro'), true)
})

test('perfil ausente (sessão inválida) nunca é autorizado em nenhum setor', () => {
  assert.equal(podeAcessarSetor(null, 'fiscal'), false)
})

test('resolveSetorPagina extrai setor e página da URL real (não de header nenhum)', () => {
  assert.deepEqual(resolveSetorPagina('/financeiro/dashboard'), { setor: 'financeiro', pagina: 'dashboard' })
  assert.deepEqual(resolveSetorPagina('/fiscal/clientes/123'), { setor: 'fiscal', pagina: 'clientes' })
  assert.deepEqual(resolveSetorPagina('/intranet'), { setor: null, pagina: '' })
})

test('página fora da lista sempre-liberada exige paginas_acesso explícito', () => {
  assert.equal(podeAcessarPagina(usuarioFiscal, 'fiscal', 'parametros'), false)
  assert.equal(
    podeAcessarPagina({ ...usuarioFiscal, paginas_acesso: ['fiscal:parametros'] }, 'fiscal', 'parametros'),
    true
  )
})

test('páginas sempre-liberadas (dashboard/agenda/bots/tarefas) não exigem paginas_acesso', () => {
  assert.equal(podeAcessarPagina(usuarioFiscal, 'fiscal', 'dashboard'), true)
  assert.equal(podeAcessarPagina(usuarioFiscal, 'fiscal', 'tarefas'), true)
})
