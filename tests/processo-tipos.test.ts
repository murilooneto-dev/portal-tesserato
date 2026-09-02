import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarProcessoTipos,
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  type EtapaForm,
  type ProcessoTipoRow,
  type ProcessoSubetapaRow,
} from '../lib/processo-tipos'

test('montarProcessoTipos: agrupa subetapas por etapa (nome) e ordena por "ordem"', () => {
  const tipos: ProcessoTipoRow[] = [
    { id: 'tipo-1', nome: 'Abertura de empresa', etapas: ['Consulta de viabilidade', 'Registro na junta'] },
  ]
  const subetapas: ProcessoSubetapaRow[] = [
    { id: 'sub-2', processo_tipo_id: 'tipo-1', etapa_nome: 'Consulta de viabilidade', nome: 'Anexar comprovante', tipo_resposta: 'texto', ordem: 1 },
    { id: 'sub-1', processo_tipo_id: 'tipo-1', etapa_nome: 'Consulta de viabilidade', nome: 'Data da consulta', tipo_resposta: 'data', ordem: 0 },
  ]

  const resultado = montarProcessoTipos(tipos, subetapas)

  assert.deepEqual(resultado, [
    {
      id: 'tipo-1',
      nome: 'Abertura de empresa',
      etapas: [
        {
          nome: 'Consulta de viabilidade',
          subetapas: [
            { id: 'sub-1', nome: 'Data da consulta', tipoResposta: 'data' },
            { id: 'sub-2', nome: 'Anexar comprovante', tipoResposta: 'texto' },
          ],
        },
        { nome: 'Registro na junta', subetapas: [] },
      ],
    },
  ])
})

test('montarProcessoTipos: tipo sem nenhuma etapa devolve lista vazia', () => {
  const tipos: ProcessoTipoRow[] = [{ id: 'tipo-1', nome: 'Vazio', etapas: [] }]
  assert.deepEqual(montarProcessoTipos(tipos, []), [{ id: 'tipo-1', nome: 'Vazio', etapas: [] }])
})

test('montarProcessoTipos: etapas=null (nunca deveria acontecer, mas não deve quebrar) vira lista vazia', () => {
  const tipos: ProcessoTipoRow[] = [{ id: 'tipo-1', nome: 'Sem etapas', etapas: null }]
  assert.deepEqual(montarProcessoTipos(tipos, []), [{ id: 'tipo-1', nome: 'Sem etapas', etapas: [] }])
})

test('montarProcessoTipos: subetapa de outro tipo não vaza pro tipo errado', () => {
  const tipos: ProcessoTipoRow[] = [
    { id: 'tipo-1', nome: 'A', etapas: ['Etapa X'] },
    { id: 'tipo-2', nome: 'B', etapas: ['Etapa X'] },
  ]
  const subetapas: ProcessoSubetapaRow[] = [
    { id: 'sub-1', processo_tipo_id: 'tipo-2', etapa_nome: 'Etapa X', nome: 'Só do tipo B', tipo_resposta: 'checklist', ordem: 0 },
  ]

  const resultado = montarProcessoTipos(tipos, subetapas)

  assert.deepEqual(resultado[0].etapas[0].subetapas, [])
  assert.deepEqual(resultado[1].etapas[0].subetapas, [{ id: 'sub-1', nome: 'Só do tipo B', tipoResposta: 'checklist' }])
})

test('adicionarEtapa: acrescenta etapa nova sem subetapas', () => {
  const resultado = adicionarEtapa([], 'Consulta de viabilidade')
  assert.deepEqual(resultado, [{ nome: 'Consulta de viabilidade', subetapas: [] }])
})

test('adicionarEtapa: corta espaços nas pontas', () => {
  const resultado = adicionarEtapa([], '  Registro na junta  ')
  assert.deepEqual(resultado, [{ nome: 'Registro na junta', subetapas: [] }])
})

test('adicionarEtapa: nome vazio (só espaço) não adiciona nada', () => {
  const etapas: EtapaForm[] = [{ nome: 'Existente', subetapas: [] }]
  assert.deepEqual(adicionarEtapa(etapas, '   '), etapas)
})

test('removerEtapa: remove só o índice pedido, preserva as outras', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [] },
    { nome: 'B', subetapas: [] },
    { nome: 'C', subetapas: [] },
  ]
  assert.deepEqual(removerEtapa(etapas, 1).map(e => e.nome), ['A', 'C'])
})

test('adicionarSubetapa: acrescenta subetapa só na etapa certa, sem tocar nas outras', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [] },
    { nome: 'B', subetapas: [] },
  ]
  const resultado = adicionarSubetapa(etapas, 1, 'Anexar contrato', 'texto')
  assert.deepEqual(resultado[0].subetapas, [])
  assert.deepEqual(resultado[1].subetapas, [{ nome: 'Anexar contrato', tipoResposta: 'texto' }])
})

test('adicionarSubetapa: corta espaços e ignora nome vazio', () => {
  const etapas: EtapaForm[] = [{ nome: 'A', subetapas: [] }]
  assert.deepEqual(adicionarSubetapa(etapas, 0, '  Conferir documento  ', 'checklist')[0].subetapas, [
    { nome: 'Conferir documento', tipoResposta: 'checklist' },
  ])
  assert.deepEqual(adicionarSubetapa(etapas, 0, '   ', 'checklist'), etapas)
})

test('removerSubetapa: remove só a subetapa pedida daquela etapa', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { nome: 'Sub 1', tipoResposta: 'texto' },
        { nome: 'Sub 2', tipoResposta: 'data' },
      ],
    },
  ]
  const resultado = removerSubetapa(etapas, 0, 0)
  assert.deepEqual(resultado[0].subetapas, [{ nome: 'Sub 2', tipoResposta: 'data' }])
})
