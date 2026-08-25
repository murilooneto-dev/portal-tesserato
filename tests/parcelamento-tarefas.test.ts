import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MES_PARA_COLUNA, isoParaDdMm, ddMmParaIso, nomeTarefaParcelamento, nomesTarefaParcelamentos, montarUpdateParcelamento, separarRenomeacoesEInsercoes } from '../lib/parcelamento-tarefas'

test('MES_PARA_COLUNA mapeia os 12 meses pras colunas de parcelamentos (set, nao sep)', () => {
  assert.equal(MES_PARA_COLUNA[1], 'jan')
  assert.equal(MES_PARA_COLUNA[9], 'set')
  assert.equal(MES_PARA_COLUNA[12], 'dez')
})

test('isoParaDdMm converte yyyy-mm-dd pra dd/mm', () => {
  assert.equal(isoParaDdMm('2026-08-07'), '07/08')
  assert.equal(isoParaDdMm('2026-01-31'), '31/01')
})

test('ddMmParaIso converte dd/mm + ano pra ISO completo', () => {
  const iso = ddMmParaIso('07/08', 2026)
  assert.ok(iso)
  assert.ok(iso!.startsWith('2026-08-07'))
})

test('ddMmParaIso retorna null pra texto invalido', () => {
  assert.equal(ddMmParaIso('nao é uma data', 2026), null)
  assert.equal(ddMmParaIso('', 2026), null)
})

test('ddMmParaIso rejeita datas invalidas do calendario (rollover)', () => {
  assert.equal(ddMmParaIso('31/02', 2026), null)  // fevereiro nao tem 31 dias
  assert.equal(ddMmParaIso('30/02', 2026), null)  // fevereiro nao tem 30 dias
  assert.equal(ddMmParaIso('29/02', 2026), null)  // 2026 nao e bissexto
})

test('nomeTarefaParcelamento sem desambiguacao usa so a secao', () => {
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', 'SEQ 4394823', false), 'Parcelamentos (PGFN - ECAC)')
})

test('nomeTarefaParcelamento com desambiguacao inclui local/tipo', () => {
  assert.equal(
    nomeTarefaParcelamento('PGFN - ECAC', 'SEQ 4394823', true),
    'Parcelamentos (PGFN - ECAC / SEQ 4394823)',
  )
})

test('nomeTarefaParcelamento com desambiguacao mas sem local/tipo cai pro nome base', () => {
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', null, true), 'Parcelamentos (PGFN - ECAC)')
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', '  ', true), 'Parcelamentos (PGFN - ECAC)')
})

test('nomesTarefaParcelamentos: secao unica no cliente nao desambigua', () => {
  const nomes = nomesTarefaParcelamentos([
    { id: 'a', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: null },
  ])
  assert.equal(nomes.get('a'), 'Parcelamentos (PGFN - ECAC)')
})

test('nomesTarefaParcelamentos: 2 parcelamentos com local/tipo diferente desambiguam normal', () => {
  const nomes = nomesTarefaParcelamentos([
    { id: 'a', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: 'SEQ 1' },
    { id: 'b', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: 'SEQ 2' },
  ])
  assert.equal(nomes.get('a'), 'Parcelamentos (PGFN - ECAC / SEQ 1)')
  assert.equal(nomes.get('b'), 'Parcelamentos (PGFN - ECAC / SEQ 2)')
})

test('nomesTarefaParcelamentos: local/tipo vazio nos dois ainda colide -- desempata com contador', () => {
  const nomes = nomesTarefaParcelamentos([
    { id: 'b', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: null },
    { id: 'a', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: null },
  ])
  assert.equal(nomes.get('a'), 'Parcelamentos (PGFN - ECAC) (1)')
  assert.equal(nomes.get('b'), 'Parcelamentos (PGFN - ECAC) (2)')
})

test('nomesTarefaParcelamentos: local/tipo identico nos dois ainda colide -- desempata com contador', () => {
  const nomes = nomesTarefaParcelamentos([
    { id: 'a', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: 'ECAC' },
    { id: 'b', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: 'ECAC' },
  ])
  assert.equal(nomes.get('a'), 'Parcelamentos (PGFN - ECAC / ECAC) (1)')
  assert.equal(nomes.get('b'), 'Parcelamentos (PGFN - ECAC / ECAC) (2)')
})

test('nomesTarefaParcelamentos: colisao so desempata dentro do mesmo cliente', () => {
  const nomes = nomesTarefaParcelamentos([
    { id: 'a', clienteId: 'c1', secao: 'PGFN - ECAC', localTipo: null },
    { id: 'b', clienteId: 'c2', secao: 'PGFN - ECAC', localTipo: null },
  ])
  assert.equal(nomes.get('a'), 'Parcelamentos (PGFN - ECAC)')
  assert.equal(nomes.get('b'), 'Parcelamentos (PGFN - ECAC)')
})

test('montarUpdateParcelamento mantem os meses quando empresa_avulsa=true', () => {
  const form = { empresa: 'Padaria X', secao: 'PGFN', jan: '10/01', fev: null, mar: '15/03' }
  const resultado = montarUpdateParcelamento(form, true)
  assert.deepEqual(resultado, form)
})

test('montarUpdateParcelamento remove os 12 campos de mes quando empresa_avulsa=false', () => {
  const form = {
    empresa: 'Cliente Y', secao: 'PGFN',
    jan: '10/01', fev: null, mar: null, abr: null, mai: null, jun: null,
    jul: null, ago: null, set: null, out: null, nov: null, dez: null,
  }
  const resultado = montarUpdateParcelamento(form, false)
  assert.deepEqual(resultado, { empresa: 'Cliente Y', secao: 'PGFN' })
})

test('montarUpdateParcelamento nao muda o objeto original', () => {
  const form = { empresa: 'Cliente Z', jan: '01/01' }
  montarUpdateParcelamento(form, false)
  assert.equal(form.jan, '01/01')
})

test('separarRenomeacoesEInsercoes: sem tarefas existentes, tudo vai pra insercao', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN)'], ['p2', 'Parcelamentos (DETRAN)']])
  const resultado = separarRenomeacoesEInsercoes(['p1', 'p2'], nomes, [])
  assert.deepEqual(resultado.inserirIds, ['p1', 'p2'])
  assert.deepEqual(resultado.renomear, [])
})

test('separarRenomeacoesEInsercoes: tarefa existente com mesmo tipo calculado nao aparece em nenhuma lista', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN)']])
  const tarefasExistentes = [{ id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' }]
  const resultado = separarRenomeacoesEInsercoes(['p1'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, [])
  assert.deepEqual(resultado.renomear, [])
})

test('separarRenomeacoesEInsercoes: tarefa existente com tipo diferente vai pra renomear', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN) (1)']])
  const tarefasExistentes = [{ id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' }]
  const resultado = separarRenomeacoesEInsercoes(['p1'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, [])
  assert.deepEqual(resultado.renomear, [{ tarefaId: 't1', novoTipo: 'Parcelamentos (PGFN) (1)' }])
})

test('separarRenomeacoesEInsercoes: mistura de inserir, renomear e no-op', () => {
  const nomes = new Map([
    ['p1', 'Parcelamentos (PGFN) (1)'],  // vai renomear (tipo antigo diferente)
    ['p2', 'Parcelamentos (DETRAN)'],     // no-op (tipo ja bate)
    ['p3', 'Parcelamentos (ICMS)'],       // vai inserir (sem tarefa ainda)
  ])
  const tarefasExistentes = [
    { id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' },
    { id: 't2', parcelamento_id: 'p2', tipo: 'Parcelamentos (DETRAN)' },
  ]
  const resultado = separarRenomeacoesEInsercoes(['p1', 'p2', 'p3'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, ['p3'])
  assert.deepEqual(resultado.renomear, [{ tarefaId: 't1', novoTipo: 'Parcelamentos (PGFN) (1)' }])
})
