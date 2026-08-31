// tests/preenchimento-rapido.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nomesTarefaTipoData,
  valoresDistintos,
  clientesPorValor,
  tarefasTipoDataVinculadas,
} from '../lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '../lib/tarefas-esperadas'

test('nomesTarefaTipoData: mantém só tipo_resposta=data sem etapas', () => {
  const nomes = nomesTarefaTipoData([
    { nome: 'DAS', tipo_resposta: 'data', etapas: null },
    { nome: 'RELATORIO', tipo_resposta: 'texto', etapas: null },
    { nome: 'FECHAMENTO', tipo_resposta: 'data', etapas: ['Conferência', 'Envio'] },
    { nome: 'ISS', tipo_resposta: 'data', etapas: [] },
  ])
  assert.deepEqual(nomes, ['DAS', 'ISS'])
})

test('nomesTarefaTipoData: lista vazia devolve lista vazia', () => {
  assert.deepEqual(nomesTarefaTipoData([]), [])
})

test('valoresDistintos: extrai valores únicos e ordena', () => {
  const valores = valoresDistintos(
    [
      { id: '1', nome: 'A', regime: 'Simples Nacional' },
      { id: '2', nome: 'B', regime: 'Lucro Presumido' },
      { id: '3', nome: 'C', regime: 'Simples Nacional' },
      { id: '4', nome: 'D', regime: null },
    ],
    'regime',
  )
  assert.deepEqual(valores, ['Lucro Presumido', 'Simples Nacional'])
})

test('valoresDistintos: campo ausente (ex: grupo em Contábil) não quebra', () => {
  const valores = valoresDistintos(
    [{ id: '1', nome: 'A', regime: 'Simples Nacional' }],
    'grupo',
  )
  assert.deepEqual(valores, [])
})

test('clientesPorValor: filtra só quem tem exatamente aquele valor', () => {
  const clientes = [
    { id: '1', nome: 'A', regime: 'Simples Nacional' },
    { id: '2', nome: 'B', regime: 'Lucro Presumido' },
    { id: '3', nome: 'C', regime: 'Simples Nacional' },
  ]
  const filtrados = clientesPorValor(clientes, 'regime', 'Simples Nacional')
  assert.deepEqual(filtrados.map(c => c.id), ['1', '3'])
})

test('tarefasTipoDataVinculadas: cruza vínculo do valor com o conjunto de tipos DATA', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: {},
    porRegime: { 'Simples Nacional': ['DAS', 'FECHAMENTO SIMPLES', 'RELATORIO'] },
    porAtividade: {},
  }
  const tarefas = tarefasTipoDataVinculadas(
    mapa, 'regime', 'Simples Nacional', new Set(['DAS', 'FECHAMENTO SIMPLES']),
  )
  assert.deepEqual(tarefas, ['DAS', 'FECHAMENTO SIMPLES'])
})

test('tarefasTipoDataVinculadas: valor sem vínculo cadastrado devolve lista vazia', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }
  const tarefas = tarefasTipoDataVinculadas(mapa, 'regime', 'Inexistente', new Set(['DAS']))
  assert.deepEqual(tarefas, [])
})

test('valoresDistintos: campo atividade achata os arrays e ordena', () => {
  const valores = valoresDistintos(
    [
      { id: '1', nome: 'A', atividade: ['Serviço', 'Comércio'] },
      { id: '2', nome: 'B', atividade: ['Comércio'] },
      { id: '3', nome: 'C', atividade: null },
    ],
    'atividade',
  )
  assert.deepEqual(valores, ['Comércio', 'Serviço'])
})

test('clientesPorValor: campo atividade filtra quem tem aquele valor entre as suas', () => {
  const clientes = [
    { id: '1', nome: 'A', atividade: ['Serviço', 'Comércio'] },
    { id: '2', nome: 'B', atividade: ['Comércio'] },
    { id: '3', nome: 'C', atividade: ['Indústria'] },
  ]
  const filtrados = clientesPorValor(clientes, 'atividade', 'Comércio')
  assert.deepEqual(filtrados.map(c => c.id), ['1', '2'])
})
