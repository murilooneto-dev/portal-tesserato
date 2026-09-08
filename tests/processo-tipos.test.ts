import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarProcessoTipos,
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  moverSubetapa,
  renomearEtapa,
  editarSubetapa,
  paraEtapaForm,
  type EtapaForm,
  type ProcessoTipoRow,
  type ProcessoSubetapaRow,
  type ProcessoTipoResumo,
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

test('moverSubetapa: "up" troca com a anterior', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { nome: 'Sub 1', tipoResposta: 'texto' },
        { nome: 'Sub 2', tipoResposta: 'data' },
        { nome: 'Sub 3', tipoResposta: 'checklist' },
      ],
    },
  ]
  const resultado = moverSubetapa(etapas, 0, 1, 'up')
  assert.deepEqual(resultado[0].subetapas.map(s => s.nome), ['Sub 2', 'Sub 1', 'Sub 3'])
})

test('moverSubetapa: "down" troca com a seguinte', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { nome: 'Sub 1', tipoResposta: 'texto' },
        { nome: 'Sub 2', tipoResposta: 'data' },
        { nome: 'Sub 3', tipoResposta: 'checklist' },
      ],
    },
  ]
  const resultado = moverSubetapa(etapas, 0, 1, 'down')
  assert.deepEqual(resultado[0].subetapas.map(s => s.nome), ['Sub 1', 'Sub 3', 'Sub 2'])
})

test('moverSubetapa: no-op ao tentar subir a primeira ou descer a última', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { nome: 'Sub 1', tipoResposta: 'texto' },
        { nome: 'Sub 2', tipoResposta: 'data' },
      ],
    },
  ]
  assert.deepEqual(moverSubetapa(etapas, 0, 0, 'up'), etapas)
  assert.deepEqual(moverSubetapa(etapas, 0, 1, 'down'), etapas)
})

test('moverSubetapa: não toca em outras etapas', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [{ nome: 'Sub A1', tipoResposta: 'texto' }, { nome: 'Sub A2', tipoResposta: 'texto' }] },
    { nome: 'B', subetapas: [{ nome: 'Sub B1', tipoResposta: 'texto' }, { nome: 'Sub B2', tipoResposta: 'texto' }] },
  ]
  const resultado = moverSubetapa(etapas, 1, 0, 'down')
  assert.deepEqual(resultado[0], etapas[0])
  assert.deepEqual(resultado[1].subetapas.map(s => s.nome), ['Sub B2', 'Sub B1'])
})

test('renomearEtapa: atualiza o nome, preserva nomeOriginal e as subetapas', () => {
  const etapas: EtapaForm[] = [
    { nomeOriginal: 'Etapa X', nome: 'Etapa X', subetapas: [{ id: 'sub-1', nome: 'Sub 1', tipoResposta: 'texto' }] },
  ]
  const resultado = renomearEtapa(etapas, 0, 'Etapa Y')
  assert.deepEqual(resultado, [
    { nomeOriginal: 'Etapa X', nome: 'Etapa Y', subetapas: [{ id: 'sub-1', nome: 'Sub 1', tipoResposta: 'texto' }] },
  ])
})

test('renomearEtapa: não toca em outras etapas', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [] },
    { nome: 'B', subetapas: [] },
  ]
  const resultado = renomearEtapa(etapas, 1, 'B renomeada')
  assert.equal(resultado[0], etapas[0])
  assert.equal(resultado[1].nome, 'B renomeada')
})

test('editarSubetapa: atualiza nome e tipoResposta da subetapa certa, preserva id', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { id: 'sub-1', nome: 'Sub 1', tipoResposta: 'texto' },
        { id: 'sub-2', nome: 'Sub 2', tipoResposta: 'data' },
      ],
    },
  ]
  const resultado = editarSubetapa(etapas, 0, 1, 'Sub 2 editada', 'checklist')
  assert.deepEqual(resultado[0].subetapas, [
    { id: 'sub-1', nome: 'Sub 1', tipoResposta: 'texto' },
    { id: 'sub-2', nome: 'Sub 2 editada', tipoResposta: 'checklist' },
  ])
})

test('editarSubetapa: não toca em outras etapas', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [{ nome: 'Sub A1', tipoResposta: 'texto' }] },
    { nome: 'B', subetapas: [{ nome: 'Sub B1', tipoResposta: 'texto' }] },
  ]
  const resultado = editarSubetapa(etapas, 1, 0, 'Sub B1 editada', 'data')
  assert.equal(resultado[0], etapas[0])
  assert.deepEqual(resultado[1].subetapas, [{ nome: 'Sub B1 editada', tipoResposta: 'data' }])
})

test('paraEtapaForm: converte um ProcessoTipoResumo em EtapaForm[] com nomeOriginal e id populados', () => {
  const tipo: ProcessoTipoResumo = {
    id: 'tipo-1',
    nome: 'Abertura de empresa',
    etapas: [
      {
        nome: 'Consulta de viabilidade',
        subetapas: [{ id: 'sub-1', nome: 'Data da consulta', tipoResposta: 'data' }],
      },
      { nome: 'Registro na junta', subetapas: [] },
    ],
  }
  assert.deepEqual(paraEtapaForm(tipo), [
    {
      nomeOriginal: 'Consulta de viabilidade',
      nome: 'Consulta de viabilidade',
      subetapas: [{ id: 'sub-1', nome: 'Data da consulta', tipoResposta: 'data' }],
    },
    { nomeOriginal: 'Registro na junta', nome: 'Registro na junta', subetapas: [] },
  ])
})
