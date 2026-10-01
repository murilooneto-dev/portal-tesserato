import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffTarefas, descreverEventoTarefas } from '../lib/logs-tarefas'

test('diff detecta adicionadas e removidas, ignorando ordem e duplicados', () => {
  assert.deepEqual(diffTarefas(['B', 'A', 'A'], ['C', 'A']), { adicionadas: ['C'], removidas: ['B'] })
})

test('diff sem mudança devolve listas vazias', () => {
  assert.deepEqual(diffTarefas(['A', 'B'], ['B', 'A']), { adicionadas: [], removidas: [] })
})

test('diff com antes nulo (cliente novo) = tudo adicionado', () => {
  assert.deepEqual(diffTarefas(null, ['ISS', 'DAS']), { adicionadas: ['DAS', 'ISS'], removidas: [] })
})

test('descrição do evento de cliente', () => {
  assert.equal(
    descreverEventoTarefas({ acao: 'cliente', adicionadas: ['X', 'Y'], removidas: ['Z'] }),
    'Adicionadas: X, Y · Removidas: Z',
  )
  assert.equal(descreverEventoTarefas({ acao: 'cliente', removidas: ['Z'] }), 'Removidas: Z')
})

test('descrição dos eventos de grupo', () => {
  assert.equal(descreverEventoTarefas({ acao: 'grupo_criado', grupo: 'G', tarefas: ['A'] }), 'Grupo criado: G (A)')
  assert.equal(
    descreverEventoTarefas({ acao: 'grupo_editado', grupo: 'G2', grupo_antigo: 'G', tarefas: ['A', 'B'] }),
    'Grupo editado: G → G2 (A, B)',
  )
  assert.equal(descreverEventoTarefas({ acao: 'grupo_excluido', grupo: 'G' }), 'Grupo excluído: G')
  assert.equal(descreverEventoTarefas(null), '—')
})
