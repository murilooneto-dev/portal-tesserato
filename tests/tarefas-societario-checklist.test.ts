import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarDdMm } from '../lib/formatar-data'

test('formatarDdMm não recua um dia (bug de fuso horário corrigido)', () => {
  assert.equal(formatarDdMm('2026-09-03'), '03/09/2026')
  assert.equal(formatarDdMm('2026-01-01'), '01/01/2026')
  assert.equal(formatarDdMm('2026-12-31'), '31/12/2026')
})

test('formatarDdMm com null devolve string vazia', () => {
  assert.equal(formatarDdMm(null), '')
})

test('formatarDdMm lida com timestamptz (tarefas.concluida_em) sem gerar lixo', () => {
  // Formato real devolvido pelo PostgREST pra uma coluna timestamptz,
  // gravada com hora-âncora 12:00:00 UTC (toggleTarefaSocietario). Antes da
  // correção, o split ingênuo em '-' produzia "03T12:00:00+00:00/09/2026".
  assert.equal(formatarDdMm('2026-09-03T12:00:00+00:00'), '03/09/2026')
  assert.equal(formatarDdMm('2026-01-01T12:00:00+00:00'), '01/01/2026')
})
