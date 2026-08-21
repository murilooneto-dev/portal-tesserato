import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '../lib/tarefas-esperadas'

const mapaVazio: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }

test('calcularTarefasEsperadas: sem vínculo nenhum, devolve só tarefas_personalizadas', () => {
  const cliente = { grupo: 'simples', regime: null, atividade: 'Serviço', tarefas_personalizadas: ['DAS', 'ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapaVazio)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo só por grupo soma com tarefas_personalizadas', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['FECHAMENTO SIMPLES', 'DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'simples', regime: null, atividade: null, tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo só por regime', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: { Normal: ['IRPJ/CSLL'] }, porAtividade: {} }
  const cliente = { grupo: null, regime: 'Normal', atividade: null, tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['IRPJ/CSLL'])
})

test('calcularTarefasEsperadas: vínculo só por atividade', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: { Serviço: ['ISS'] } }
  const cliente = { grupo: null, regime: null, atividade: 'Serviço', tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['ISS'])
})

test('calcularTarefasEsperadas: combinação dos 3 sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: { simples: ['DAS', 'FECHAMENTO SIMPLES'] },
    porRegime: { Normal: ['IRPJ/CSLL'] },
    porAtividade: { Serviço: ['ISS', 'DAS'] },
  }
  const cliente = { grupo: 'simples', regime: 'Normal', atividade: 'Serviço', tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'IRPJ/CSLL', 'ISS'])
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
