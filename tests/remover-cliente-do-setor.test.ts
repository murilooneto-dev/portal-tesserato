// tests/remover-cliente-do-setor.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { removerClienteDoSetor, type ClienteSupabaseMinimo } from '../lib/remover-cliente-do-setor'

interface Chamada { tabela: string; op: 'delete' | 'update'; valores?: unknown; filtros: Record<string, unknown> }

// Client falso: registra cada chamada na ordem e pode falhar em "<tabela>.<op>".
function clienteFalso(falhas: Record<string, string> = {}) {
  const chamadas: Chamada[] = []
  const client: ClienteSupabaseMinimo = {
    from(tabela: string) {
      const montar = (op: 'delete' | 'update', valores?: unknown) => {
        const filtros: Record<string, unknown> = {}
        const b = {
          eq(coluna: string, valor: unknown) { filtros[coluna] = valor; return b },
          then<T>(resolve: (v: { error: { message: string } | null }) => T) {
            chamadas.push({ tabela, op, valores, filtros: { ...filtros } })
            const msg = falhas[`${tabela}.${op}`]
            return Promise.resolve(resolve({ error: msg ? { message: msg } : null }))
          },
        }
        return b
      }
      return { delete: () => montar('delete'), update: (v: Record<string, unknown>) => montar('update', v) }
    },
  }
  return { client, chamadas }
}

test('cliente só no setor: apaga somente a linha do cliente (a cascata leva o resto)', async () => {
  const { client, chamadas } = clienteFalso()
  const r = await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'contabil', setoresAtuais: ['contabil'] })
  assert.deepEqual(r, { error: null, clienteRemovidoDoTodo: true })
  assert.deepEqual(chamadas, [{ tabela: 'clientes', op: 'delete', valores: undefined, filtros: { id: 'c1' } }])
})

test('cliente só no setor e o banco recusa apagar: devolve o erro e NÃO apagou mais nada antes', async () => {
  const { client, chamadas } = clienteFalso({ 'clientes.delete': 'violates foreign key constraint' })
  const r = await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'pessoal', setoresAtuais: ['pessoal'] })
  assert.equal(r.error, 'violates foreign key constraint')
  assert.equal(r.clienteRemovidoDoTodo, false)
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].tabela, 'clientes')
})

test('cliente em outros setores: apaga tarefas do setor, ficha do setor e atualiza setores, nessa ordem', async () => {
  const { client, chamadas } = clienteFalso()
  const r = await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'contabil', setoresAtuais: ['fiscal', 'contabil'] })
  assert.deepEqual(r, { error: null, clienteRemovidoDoTodo: false })
  assert.deepEqual(chamadas.map(c => `${c.tabela}.${c.op}`), ['tarefas.delete', 'clientes_contabil.delete', 'clientes.update'])
  assert.deepEqual(chamadas[0].filtros, { cliente_id: 'c1', setor: 'contabil' })
  assert.deepEqual(chamadas[1].filtros, { cliente_id: 'c1' })
  assert.deepEqual(chamadas[2].valores, { setores: ['fiscal'] })
  assert.deepEqual(chamadas[2].filtros, { id: 'c1' })
})

test('cliente em outros setores no Pessoal: usa a tabela clientes_pessoal', async () => {
  const { client, chamadas } = clienteFalso()
  await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'pessoal', setoresAtuais: ['fiscal', 'pessoal'] })
  assert.deepEqual(chamadas.map(c => `${c.tabela}.${c.op}`), ['tarefas.delete', 'clientes_pessoal.delete', 'clientes.update'])
})

test('falha ao apagar as tarefas do setor: devolve o erro e não mexe na ficha nem em clientes.setores', async () => {
  const { client, chamadas } = clienteFalso({ 'tarefas.delete': 'timeout' })
  const r = await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'contabil', setoresAtuais: ['fiscal', 'contabil'] })
  assert.equal(r.error, 'timeout')
  assert.equal(r.clienteRemovidoDoTodo, false)
  assert.deepEqual(chamadas.map(c => `${c.tabela}.${c.op}`), ['tarefas.delete'])
})

test('falha ao atualizar clientes.setores: o erro é devolvido, não engolido', async () => {
  const { client } = clienteFalso({ 'clientes.update': 'permission denied' })
  const r = await removerClienteDoSetor(client, { clienteId: 'c1', setor: 'contabil', setoresAtuais: ['fiscal', 'contabil'] })
  assert.equal(r.error, 'permission denied')
  assert.equal(r.clienteRemovidoDoTodo, false)
})
