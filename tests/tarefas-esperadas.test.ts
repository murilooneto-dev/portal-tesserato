import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTarefasEsperadas, tarefasAutomaticasVisiveis, type MapaVinculosSetor } from '../lib/tarefas-esperadas'

const mapaVazio: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }

test('calcularTarefasEsperadas: sem vínculo nenhum, devolve só tarefas_personalizadas', () => {
  const cliente = { grupo: 'simples', regime: null, atividade: ['Serviço'], tarefas_personalizadas: ['DAS', 'ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapaVazio)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo só por grupo soma com tarefas_personalizadas', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['FECHAMENTO SIMPLES', 'DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'simples', regime: null, atividade: null, tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo solto de regime foi retirado — porRegime nunca influencia o resultado', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: { Normal: ['IRPJ/CSLL'] }, porAtividade: {} }
  const cliente = { grupo: null, regime: 'Normal', atividade: null, tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, [])
})

test('calcularTarefasEsperadas: vínculo de atividade sem regime (regimeNome null) aplica pra qualquer regime', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: { Serviço: [{ tarefa: 'ISS', regimeNome: null }] } }
  const cliente = { grupo: null, regime: 'Simples', atividade: ['Serviço'], tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['ISS'])
})

test('calcularTarefasEsperadas: vínculo atividade+regime só aplica quando os dois batem', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: { Comércio: [{ tarefa: 'ICMS ST', regimeNome: 'Simples' }] } }

  const clienteBate = { grupo: null, regime: 'Simples', atividade: ['Comércio'], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteBate, mapa), ['ICMS ST'])

  const clienteRegimeDiferente = { grupo: null, regime: 'Lucro Presumido', atividade: ['Comércio'], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteRegimeDiferente, mapa), [])

  const clienteSemAtividade = { grupo: null, regime: 'Simples', atividade: [], tarefas_personalizadas: [] }
  assert.deepEqual(calcularTarefasEsperadas(clienteSemAtividade, mapa), [])
})

test('calcularTarefasEsperadas: combinação grupo + atividade (com e sem regime) sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: { simples: ['DAS', 'FECHAMENTO SIMPLES'] },
    porRegime: {},
    porAtividade: { Serviço: [{ tarefa: 'ISS', regimeNome: null }, { tarefa: 'DAS', regimeNome: null }] },
  }
  const cliente = { grupo: 'simples', regime: 'Normal', atividade: ['Serviço'], tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'ISS'])
})

test('calcularTarefasEsperadas: cliente sem grupo/regime/atividade preenchido', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: null, regime: null, atividade: null, tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})

test('calcularTarefasEsperadas: grupo do cliente sem entrada no mapa (não cadastrado/renomeado) não quebra', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'nome-que-nao-existe-no-catalogo', regime: null, atividade: null, tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})

test('calcularTarefasEsperadas: cliente com 2 atividades soma os vínculos das duas sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: {},
    porRegime: {},
    porAtividade: {
      Serviço: [{ tarefa: 'ISS', regimeNome: null }, { tarefa: 'DAS', regimeNome: null }],
      Comércio: [{ tarefa: 'DAS', regimeNome: null }, { tarefa: 'ICMS', regimeNome: null }],
    },
  }
  const cliente = { grupo: null, regime: null, atividade: ['Serviço', 'Comércio'], tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'ICMS', 'ISS'])
})

test('calcularTarefasEsperadas: tarefas_excluidas some da lista final, mesmo vindo de grupo ou atividade', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: { simples: ['DAS', 'FECHAMENTO SIMPLES'] },
    porRegime: {},
    porAtividade: { Comércio: [{ tarefa: 'ICMS ST', regimeNome: null }] },
  }
  const cliente = {
    grupo: 'simples', regime: null, atividade: ['Comércio'],
    tarefas_personalizadas: [], tarefas_excluidas: ['DAS', 'ICMS ST'],
  }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['FECHAMENTO SIMPLES'])
})

test('calcularTarefasEsperadas: tarefas_excluidas nunca afeta tarefas_personalizadas — readicionar manualmente sempre mostra', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = {
    grupo: 'simples', regime: null, atividade: null,
    tarefas_personalizadas: ['DAS'], tarefas_excluidas: ['DAS'],
  }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['DAS'])
})

test('calcularTarefasEsperadas: sem tarefas_excluidas (undefined) se comporta igual a hoje', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'simples', regime: null, atividade: null, tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('tarefasAutomaticasVisiveis: mostra as automáticas, tira as excluídas e as que já são personalizada', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: { simples: ['DAS', 'FECHAMENTO SIMPLES'] },
    porRegime: {},
    porAtividade: { Comércio: [{ tarefa: 'ICMS ST', regimeNome: null }] },
  }
  const cliente = {
    grupo: 'simples', regime: null, atividade: ['Comércio'],
    tarefas_personalizadas: ['FECHAMENTO SIMPLES'], tarefas_excluidas: ['ICMS ST'],
  }
  const resultado = tarefasAutomaticasVisiveis(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS'])
})
