// tests/agenda.test.ts — regras da agenda pessoal (Início e /fiscal/agenda).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  celulasDoMes, chaveDia, chaveDeHoje, diasAte, tomDoCompromisso, compromissosDoDia, lembretesProximos,
  rotuloLembrete, tituloDoDia, contarCompromissos, validarCompromisso, payloadCompromisso, formVazio, horaCurta,
  type Compromisso,
} from '../lib/agenda'

const hoje = new Date(2026, 8, 30, 15, 20) // 30/09/2026, meio da tarde
const c = (id: string, data: string, extra: Partial<Compromisso> = {}): Compromisso => ({
  id, usuario_id: 'u1', titulo: id, descricao: null, data_compromisso: data, hora_compromisso: null,
  status: 'pendente', lembrete_3_dias: false, ...extra,
})

test('setembro/2026 começa na terça: 2 casas vazias, 35 casas', () => {
  const g = celulasDoMes(2026, 9)
  assert.equal(g.length, 35)
  assert.deepEqual(g.slice(0, 3), [null, null, 1])
  assert.equal(g[31], 30)
  assert.deepEqual(g.slice(32), [null, null, null])
})

test('fevereiro/2026 começa no domingo e tem 28 dias: 4 semanas exatas', () => {
  const g = celulasDoMes(2026, 2)
  assert.equal(g.length, 28)
  assert.equal(g[0], 1)
  assert.equal(g[27], 28)
})

test('agosto/2026 começa no sábado: 6 semanas', () => {
  const g = celulasDoMes(2026, 8)
  assert.equal(g.length, 42)
  assert.equal(g.indexOf(1), 6)
  assert.equal(g.indexOf(31), 36)
})

test('chaves de dia com zero à esquerda', () => {
  assert.equal(chaveDia(2026, 3, 5), '2026-03-05')
  assert.equal(chaveDeHoje(hoje), '2026-09-30')
})

test('diasAte: amanhã, ontem e virada de ano', () => {
  assert.equal(diasAte('2026-10-01', new Date(2026, 8, 30, 23, 59)), 1)
  assert.equal(diasAte('2026-09-29', hoje), -1)
  assert.equal(diasAte('2027-01-02', new Date(2026, 11, 31)), 2)
})

test('cor: concluído verde, cancelado cinza, pendente com aviso nos 3 dias âmbar, senão ciano', () => {
  assert.equal(tomDoCompromisso(c('a', '2026-09-30', { status: 'concluido', lembrete_3_dias: true }), hoje), 'ok')
  assert.equal(tomDoCompromisso(c('a', '2026-09-30', { status: 'cancelado' }), hoje), 'neu')
  assert.equal(tomDoCompromisso(c('a', '2026-10-03', { lembrete_3_dias: true }), hoje), 'warn')
  assert.equal(tomDoCompromisso(c('a', '2026-10-04', { lembrete_3_dias: true }), hoje), 'acc')
  assert.equal(tomDoCompromisso(c('a', '2026-09-29', { lembrete_3_dias: true }), hoje), 'acc')
  assert.equal(tomDoCompromisso(c('a', '2026-09-30'), hoje), 'acc')
})

test('lembretes: pendentes de hoje até +3 dias, por data e horário (sem horário por último)', () => {
  const itens = [
    c('d4', '2026-10-04'),
    c('ontem', '2026-09-29'),
    c('feito', '2026-09-30', { status: 'concluido' }),
    c('hoje-sem-hora', '2026-09-30'),
    c('hoje-16h', '2026-09-30', { hora_compromisso: '16:00' }),
    c('hoje-9h', '2026-09-30', { hora_compromisso: '09:00:00' }),
    c('d3', '2026-10-03'),
  ]
  assert.deepEqual(lembretesProximos(itens, hoje).map(i => i.id), ['hoje-9h', 'hoje-16h', 'hoje-sem-hora', 'd3'])
})

test('lembretes atravessam a virada de ano', () => {
  const r = lembretesProximos([c('ano-novo', '2027-01-02')], new Date(2026, 11, 31))
  assert.deepEqual(r.map(i => i.id), ['ano-novo'])
})

test('compromissos do dia em ordem de horário', () => {
  const itens = [c('b', '2026-09-30', { hora_compromisso: '18:00' }), c('x', '2026-10-01'), c('a', '2026-09-30', { hora_compromisso: '09:00' })]
  assert.deepEqual(compromissosDoDia(itens, '2026-09-30').map(i => i.id), ['a', 'b'])
})

test('rótulos', () => {
  assert.equal(horaCurta('09:00:00'), '09:00')
  assert.equal(horaCurta(null), '')
  assert.equal(rotuloLembrete(c('Enviar SPED', '2026-09-30', { hora_compromisso: '09:00:00' }), hoje), 'Hoje 09:00 · Enviar SPED')
  assert.equal(rotuloLembrete(c('Ligar', '2026-10-01'), hoje), 'Amanhã · Ligar')
  assert.equal(rotuloLembrete(c('Reunião', '2026-10-03', { hora_compromisso: '14:00' }), hoje), '03/10 14:00 · Reunião')
  assert.equal(tituloDoDia(2026, 9, 30), '30 de setembro de 2026')
  assert.equal(contarCompromissos(0), 'Nenhum compromisso')
  assert.equal(contarCompromissos(1), '1 compromisso')
  assert.equal(contarCompromissos(3), '3 compromissos')
})

test('formulário: título e data obrigatórios; payload limpa espaços e vazios', () => {
  assert.deepEqual(validarCompromisso(formVazio()), { titulo: 'Informe o título.', data_compromisso: 'Informe a data.' })
  assert.deepEqual(validarCompromisso({ ...formVazio('2026-09-30'), titulo: '   ' }), { titulo: 'Informe o título.' })
  assert.deepEqual(validarCompromisso({ ...formVazio('2026-09-30'), titulo: 'Ok' }), {})
  const p = payloadCompromisso({ ...formVazio('2026-09-30'), titulo: '  Enviar SPED ', descricao: '  ', hora_compromisso: '' })
  assert.equal(p.titulo, 'Enviar SPED')
  assert.equal(p.descricao, null)
  assert.equal(p.hora_compromisso, null)
  assert.equal(formVazio('2026-09-30').status, 'pendente')
})

test('validarCompromisso: data no formato certo mas impossível também é inválida', () => {
  for (const d of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31']) {
    assert.deepEqual(validarCompromisso({ ...formVazio(d), titulo: 'X' }), { data_compromisso: 'Informe a data.' }, d)
  }
  assert.deepEqual(validarCompromisso({ ...formVazio('2028-02-29'), titulo: 'X' }), {})
})
