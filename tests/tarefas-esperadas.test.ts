import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTarefasEsperadas, tarefasAutomaticasVisiveis, type MapaVinculosSetor } from '../lib/tarefas-esperadas'

const mapaVazio: MapaVinculosSetor = { porRegime: {}, porAtividade: {} }

test('calcularTarefasEsperadas: sem vínculo nenhum, devolve só tarefas_personalizadas', () => {
  const cliente = { regime: null, atividade: ['Serviço'], tarefas_personalizadas: ['DAS', 'ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapaVazio)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo solto de regime foi retirado — porRegime nunca influencia o resultado', () => {
  const mapa: MapaVinculosSetor = { porRegime: { Normal: ['IRPJ/CSLL'] }, porAtividade: {} }
  const cliente = { regime: 'Normal', atividade: null, tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, [])
})

test('calcularTarefasEsperadas: vínculo de atividade sem regime (regimeNome null) aplica pra qualquer regime', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'ISS', regimeNome: null }] } }
  const cliente = { regime: 'Simples', atividade: ['Serviço'], tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['ISS'])
})

test('calcularTarefasEsperadas: vínculo atividade+regime só aplica quando os dois batem', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Comércio: [{ tarefa: 'ICMS ST', regimeNome: 'Simples' }] } }

  const clienteBate = { regime: 'Simples', atividade: ['Comércio'], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteBate, mapa), ['ICMS ST'])

  const clienteRegimeDiferente = { regime: 'Lucro Presumido', atividade: ['Comércio'], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteRegimeDiferente, mapa), [])

  const clienteSemAtividade = { regime: 'Simples', atividade: [], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteSemAtividade, mapa), [])
})

test('calcularTarefasEsperadas: cliente sem regime/atividade preenchido', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'DAS', regimeNome: null }] } }
  const cliente = { regime: null, atividade: null, tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})

test('calcularTarefasEsperadas: atividade do cliente sem entrada no mapa (não cadastrada/renomeada) não quebra', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'DAS', regimeNome: null }] } }
  const cliente = { regime: null, atividade: ['nome-que-nao-existe-no-catalogo'], tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})

test('calcularTarefasEsperadas: cliente com 2 atividades soma os vínculos das duas sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: {
      Serviço: [{ tarefa: 'ISS', regimeNome: null }, { tarefa: 'DAS', regimeNome: null }],
      Comércio: [{ tarefa: 'DAS', regimeNome: null }, { tarefa: 'ICMS', regimeNome: null }],
    },
  }
  const cliente = { regime: null, atividade: ['Serviço', 'Comércio'], tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'ICMS', 'ISS'])
})

test('calcularTarefasEsperadas: tarefas_excluidas some da lista final, mesmo vindo de vínculo de atividade', () => {
  const mapa: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: {
      Comércio: [{ tarefa: 'ICMS ST', regimeNome: null }, { tarefa: 'DAS', regimeNome: null }],
    },
  }
  const cliente = {
    regime: null, atividade: ['Comércio'],
    tarefas_personalizadas: [], tarefas_excluidas: ['DAS', 'ICMS ST'],
  }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), [])
})

test('calcularTarefasEsperadas: tarefas_excluidas nunca afeta tarefas_personalizadas — readicionar manualmente sempre mostra', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'DAS', regimeNome: null }] } }
  const cliente = {
    regime: null, atividade: ['Serviço'],
    tarefas_personalizadas: ['DAS'], tarefas_excluidas: ['DAS'],
  }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['DAS'])
})

test('calcularTarefasEsperadas: sem tarefas_excluidas (undefined) se comporta igual a hoje', () => {
  const mapa: MapaVinculosSetor = { porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'DAS', regimeNome: null }] } }
  const cliente = { regime: null, atividade: ['Serviço'], tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('tarefasAutomaticasVisiveis: mostra as automáticas, tira as excluídas e as que já são personalizada', () => {
  const mapa: MapaVinculosSetor = {
    porRegime: {},
    porAtividade: {
      Comércio: [{ tarefa: 'ICMS ST', regimeNome: null }, { tarefa: 'DAS', regimeNome: null }, { tarefa: 'FECHAMENTO SIMPLES', regimeNome: null }],
    },
  }
  const cliente = {
    regime: null, atividade: ['Comércio'],
    tarefas_personalizadas: ['FECHAMENTO SIMPLES'], tarefas_excluidas: ['ICMS ST'],
  }
  const resultado = tarefasAutomaticasVisiveis(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS'])
})
