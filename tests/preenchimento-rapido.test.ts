// tests/preenchimento-rapido.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nomesTarefaTipoData,
  valoresDistintos,
  clientesPorValor,
  tarefasAplicaveisCliente,
  tarefasDisponiveisParaClientes,
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

test('clientesPorValor: filtra só quem tem exatamente aquele valor', () => {
  const clientes = [
    { id: '1', nome: 'A', regime: 'Simples Nacional' },
    { id: '2', nome: 'B', regime: 'Lucro Presumido' },
    { id: '3', nome: 'C', regime: 'Simples Nacional' },
  ]
  const filtrados = clientesPorValor(clientes, 'regime', 'Simples Nacional')
  assert.deepEqual(filtrados.map(c => c.id), ['1', '3'])
})

test('tarefasAplicaveisCliente: soma vínculo automático (respeitando regime) com personalizadas, menos excluídas', () => {
  const mapa: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: {
      Comércio: [
        { tarefa: 'DAS', regimeNome: null },
        { tarefa: 'DISTRIBUICAO LUCROS', regimeNome: 'Lucro Presumido' },
      ],
    },
  }
  const cliente = {
    id: '1',
    nome: 'AB Preço Único',
    regime: 'Simples Nacional',
    atividade: ['Comércio'],
    tarefas_personalizadas: ['RELATORIO EXTRA'],
    tarefas_excluidas: ['DAS'],
  }
  const tiposData = new Set(['DAS', 'DISTRIBUICAO LUCROS', 'RELATORIO EXTRA'])
  const tarefas = tarefasAplicaveisCliente(cliente, mapa, tiposData)
  // DAS foi excluído manualmente; DISTRIBUICAO LUCROS exige Lucro Presumido
  // e o cliente é Simples Nacional — nenhum dos dois se aplica.
  assert.deepEqual(Array.from(tarefas).sort(), ['RELATORIO EXTRA'])
})

test('tarefasDisponiveisParaClientes: une as tarefas aplicáveis de todos os clientes do grupo', () => {
  const mapa: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: { Comércio: [{ tarefa: 'DAS', regimeNome: null }] },
  }
  const clientes = [
    { id: '1', nome: 'A', atividade: ['Comércio'], tarefas_personalizadas: [] },
    { id: '2', nome: 'B', atividade: ['Comércio'], tarefas_personalizadas: ['ISS AVULSO'] },
  ]
  const tarefas = tarefasDisponiveisParaClientes(clientes, mapa, new Set(['DAS', 'ISS AVULSO']))
  assert.deepEqual(tarefas, ['DAS', 'ISS AVULSO'])
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
