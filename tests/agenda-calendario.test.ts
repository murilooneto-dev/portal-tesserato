// tests/agenda-calendario.test.ts — calendário do mês da agenda.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarioMes } from '../components/geral/agenda/CalendarioMes'
import type { Compromisso } from '../lib/agenda'

const nada = () => {}
const c = (id: string, data: string, titulo: string, extra: Partial<Compromisso> = {}): Compromisso => ({
  id, usuario_id: 'u1', titulo, descricao: null, data_compromisso: data, hora_compromisso: null,
  status: 'pendente', lembrete_3_dias: false, ...extra,
})
const itens = [
  c('1', '2026-09-30', 'Enviar SPED', { hora_compromisso: '09:00:00', lembrete_3_dias: true }),
  c('2', '2026-09-30', 'Ligar para cliente', { hora_compromisso: '16:00' }),
  c('3', '2026-09-30', 'Conferir backup', { hora_compromisso: '18:00' }),
  c('4', '2026-09-24', 'Visita a cliente', { status: 'cancelado' }),
]
const html = renderToStaticMarkup(h(CalendarioMes, {
  ano: 2026, mes: 9, hoje: new Date(2026, 8, 30), itens,
  onAbrirDia: nada, onMesAnterior: nada, onProximoMes: nada, onHoje: nada,
}))

test('título com o mês e navegação', () => {
  assert.match(html, /Minha agenda · Setembro 2026/)
  assert.match(html, /aria-label="Mês anterior"/)
  assert.match(html, /aria-label="Próximo mês"/)
  assert.match(html, />Hoje</)
})

test('um botão por dia, com rótulo falado, e 5 casas vazias', () => {
  assert.equal((html.match(/aria-label="\d+ de setembro de 2026: /g) ?? []).length, 30)
  assert.equal((html.match(/<div aria-hidden="true" class="border-b/g) ?? []).length, 5)
})

test('hoje marcado com aria-current="date"', () => {
  assert.match(html, /aria-label="30 de setembro de 2026: 3 compromissos"[^>]*aria-current="date"|aria-current="date"[^>]*aria-label="30 de setembro de 2026: 3 compromissos"/)
  assert.equal((html.match(/aria-current="date"/g) ?? []).length, 1)
})

test('até 2 compromissos escritos no dia e "+ 1 mais"', () => {
  assert.match(html, /09:00/)
  assert.match(html, /Enviar SPED/)
  assert.match(html, /Ligar para cliente/)
  assert.doesNotMatch(html, /Conferir backup/)
  assert.match(html, /\+ 1 mais/)
})

test('cores: âmbar no lembrete, riscado no cancelado', () => {
  assert.match(html, /bg-warn-soft[^"]*"[^>]*><b[^>]*>09:00/)
  assert.match(html, /line-through[^"]*"[^>]*>(<b[^>]*>[^<]*<\/b>)?<span[^>]*>Visita a cliente/)
})
