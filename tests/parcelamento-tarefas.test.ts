import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MES_PARA_COLUNA, isoParaDdMm, ddMmParaIso, nomeTarefaParcelamento } from '../lib/parcelamento-tarefas'

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
