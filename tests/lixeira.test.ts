// tests/lixeira.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEADER_AUTORIA,
  cabecalhosDeAutoria,
  textoResumo,
  tituloDaLinha,
  diasAteExpirar,
  agruparExclusoes,
  type LinhaLixeira,
} from '../lib/lixeira'

const UUID = '3d64c7b8-bbee-445b-bb5e-ed97e50a8060'

// ---------- cabecalhosDeAutoria ----------

test('cabecalhosDeAutoria: usuário válido vira o header x-app-usuario', () => {
  assert.equal(HEADER_AUTORIA, 'x-app-usuario')
  assert.deepEqual(cabecalhosDeAutoria(UUID), { 'x-app-usuario': UUID })
})

test('cabecalhosDeAutoria: sem usuário não manda header nenhum', () => {
  assert.deepEqual(cabecalhosDeAutoria(undefined), {})
  assert.deepEqual(cabecalhosDeAutoria(null), {})
  assert.deepEqual(cabecalhosDeAutoria(''), {})
})

test('cabecalhosDeAutoria: valor que não é UUID (inclusive com quebra de linha) é descartado', () => {
  assert.deepEqual(cabecalhosDeAutoria('nao-e-uuid'), {})
  assert.deepEqual(cabecalhosDeAutoria(`${UUID}\r\nx-outro: 1`), {})
})

// ---------- textoResumo ----------

test('textoResumo: singular e plural, na ordem de prioridade das tabelas', () => {
  assert.equal(
    textoResumo({ tarefas: 19, clientes: 1, tarefa_arquivos: 3 }),
    '1 cliente, 19 tarefas, 3 anexos de tarefas',
  )
})

test('textoResumo: um item usa o singular', () => {
  assert.equal(textoResumo({ tarefas: 1 }), '1 tarefa')
})

test('textoResumo: tabela desconhecida aparece pelo nome, sem quebrar', () => {
  assert.equal(textoResumo({ clientes: 1, tabela_nova: 2 }), '1 cliente, 2 tabela_nova')
})

// ---------- tituloDaLinha ----------

test('tituloDaLinha: cliente usa o nome', () => {
  assert.equal(tituloDaLinha('clientes', { nome: 'ACME LTDA' }), 'ACME LTDA')
})

test('tituloDaLinha: parcelamento usa empresa e seção', () => {
  assert.equal(tituloDaLinha('parcelamentos', { empresa: 'ACME', secao: 'PGFN - ECAC' }), 'ACME — PGFN - ECAC')
})

test('tituloDaLinha: tarefa usa tipo e mês/ano', () => {
  assert.equal(tituloDaLinha('tarefas', { tipo: 'ENTRADA', mes: '9', ano: '2026' }), 'ENTRADA (9/2026)')
})

test('tituloDaLinha: anexo usa o nome do arquivo', () => {
  assert.equal(tituloDaLinha('client_files', { name: 'balanco.xlsx' }), 'balanco.xlsx')
})

test('tituloDaLinha: sem campos úteis cai no rótulo da tabela (com inicial maiúscula)', () => {
  assert.equal(tituloDaLinha('clientes_contabil', {}), 'Ficha do Contábil')
  assert.equal(tituloDaLinha('tabela_nova', {}), 'tabela_nova')
})

// ---------- diasAteExpirar ----------

test('diasAteExpirar: conta dias inteiros arredondando para cima', () => {
  const agora = new Date('2026-09-29T12:00:00Z')
  assert.equal(diasAteExpirar('2026-11-28T12:00:00Z', agora), 60)
  assert.equal(diasAteExpirar('2026-09-29T20:00:00Z', agora), 1)
})

test('diasAteExpirar: já expirado não fica negativo', () => {
  assert.equal(diasAteExpirar('2026-09-01T00:00:00Z', new Date('2026-09-29T12:00:00Z')), 0)
})

// ---------- agruparExclusoes ----------

function linha(p: Partial<LinhaLixeira> & Pick<LinhaLixeira, 'id' | 'grupo' | 'tabela'>): LinhaLixeira {
  return {
    registro_id: null, campos: {}, excluido_em: '2026-09-29T10:00:00Z', excluido_por: null,
    origem_autor: 'desconhecido', expira_em: '2026-11-28T10:00:00Z', restaurado_em: null, ...p,
  }
}

test('agruparExclusoes: junta as linhas do mesmo grupo e escolhe o cliente como raiz', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 10, tabela: 'tarefas', campos: { tipo: 'T1', mes: '9', ano: '2026' } }),
    linha({ id: 2, grupo: 10, tabela: 'clientes', campos: { nome: 'ACME' } }),
    linha({ id: 3, grupo: 10, tabela: 'tarefas', campos: { tipo: 'T2', mes: '9', ano: '2026' } }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r.length, 1)
  assert.equal(r[0].grupo, 10)
  assert.equal(r[0].titulo, 'ACME')
  assert.equal(r[0].tabelaRaiz, 'clientes')
  assert.equal(r[0].resumo, '1 cliente, 2 tarefas')
  assert.deepEqual(r[0].contagens, { clientes: 1, tarefas: 2 })
})

test('agruparExclusoes: mais recentes primeiro', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, excluido_em: '2026-09-01T10:00:00Z' }),
    linha({ id: 2, grupo: 2, tabela: 'clientes', campos: { nome: 'B' }, excluido_em: '2026-09-20T10:00:00Z' }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.deepEqual(r.map(x => x.titulo), ['B', 'A'])
})

test('agruparExclusoes: só é restaurada quando TODAS as linhas do grupo foram restauradas', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, restaurado_em: '2026-09-29T11:00:00Z' }),
    linha({ id: 2, grupo: 1, tabela: 'tarefas', campos: { tipo: 'T' } }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].restaurada, false)
})

test('agruparExclusoes: resolve o nome de quem apagou e mantém a origem da autoria', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, excluido_por: UUID, origem_autor: 'servico' }),
  ], new Date('2026-09-29T12:00:00Z'), { [UUID]: 'Admin Dev' })
  assert.equal(r[0].excluidoPorNome, 'Admin Dev')
  assert.equal(r[0].origemAutor, 'servico')
})

test('agruparExclusoes: autor desconhecido fica com nome nulo', () => {
  const r = agruparExclusoes([linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' } })], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].excluidoPorNome, null)
})

test('agruparExclusoes: calcula os dias restantes até expirar', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, expira_em: '2026-11-28T12:00:00Z' }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].diasRestantes, 60)
})

test('agruparExclusoes: lista vazia dá lista vazia', () => {
  assert.deepEqual(agruparExclusoes([], new Date()), [])
})
