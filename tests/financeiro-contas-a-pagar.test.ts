// tests/financeiro-contas-a-pagar.test.ts — funções puras e ações de Contas a Pagar (forma de pagamento do tipo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ehConta, textoPreviaFormaPagamento, formatarPagoEm, contaApareceNoMes } from '../lib/financeiro-movimentos'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
// toLocaleString põe espaço sem quebra (U+00A0) depois de R$; os textos esperados usam espaço comum.
const sp = (s: string) => s.replace(/ /g, ' ')
const zero = { criadas: 0, alteradas: 0, apagadas: 0, primeira: null, ultima: null }

test('ehConta: só quando há recorrencia_id ou competencia', () => {
  assert.equal(ehConta({}), false)
  assert.equal(ehConta({ recorrencia_id: null, competencia: null }), false)
  assert.equal(ehConta({ recorrencia_id: 'x' }), true)
  assert.equal(ehConta({ competencia: '2026-10-01' }), true)
})

test('textoPreviaFormaPagamento', () => {
  assert.equal(
    sp(textoPreviaFormaPagamento({ ...zero, criadas: 12, primeira: '2027-01-01', ultima: '2027-12-01' }, 350, 10)),
    'Serão criadas 12 contas de R$ 350,00, de janeiro a dezembro de 2027, com vencimento no dia 10.',
  )
  assert.equal(
    sp(textoPreviaFormaPagamento({ ...zero, criadas: 6, primeira: '2026-10-01', ultima: '2027-03-01' }, 350, 10)),
    'Serão criadas 6 contas de R$ 350,00, de outubro de 2026 a março de 2027, com vencimento no dia 10.',
  )
  assert.equal(
    sp(textoPreviaFormaPagamento({ ...zero, criadas: 1, primeira: '2027-01-01', ultima: '2027-01-01' }, 350, 10)),
    'Será criada 1 conta de R$ 350,00, em janeiro de 2027, com vencimento no dia 10.',
  )
  assert.equal(
    sp(textoPreviaFormaPagamento({ ...zero, alteradas: 3 }, 400, 10)),
    '3 contas não pagas passam para R$ 400,00, com vencimento no dia 10.',
  )
  assert.equal(textoPreviaFormaPagamento({ ...zero, apagadas: 2 }, null, null), '2 contas não pagas serão apagadas.')
  assert.equal(textoPreviaFormaPagamento(zero, null, null), 'Nenhuma conta muda.')
})

test('formatarPagoEm', () => {
  assert.equal(formatarPagoEm('2026-10-07', '2026-10-07T17:32:00Z'), '07/10 às 14:32')
  assert.equal(formatarPagoEm('2026-10-07', null), '07/10')
  assert.equal(formatarPagoEm(null, null), '—')
})

test('financeiro-actions: pagar/desfazer e forma de pagamento', () => {
  const src = ler('lib/financeiro-actions.ts')
  const i = src.indexOf('export async function definirPagamentoConfirmado')
  assert.ok(i >= 0)
  const corpo = src.slice(i, src.indexOf('export async function', i + 10))
  assert.ok(corpo.includes(".eq('pago', !pago)"))
  assert.ok(corpo.includes('pago_em_hora'))
  for (const nome of ['previaFormaPagamentoTipo', 'definirFormaPagamentoTipo']) {
    const j = src.indexOf(`export async function ${nome}`)
    assert.ok(j >= 0, nome)
    const c = src.slice(j, src.indexOf('export async function', j + 10))
    assert.ok(c.includes('exigirAdmin()'), nome)
    assert.ok(c.includes("rpc('financeiro_definir_forma_pagamento'"), nome)
  }
})

test('menu do Financeiro: contas-a-pagar logo antes de pagamentos', async () => {
  const { PAGINAS_POR_SETOR } = await import('../lib/paginas-setor')
  const slugs = PAGINAS_POR_SETOR.financeiro.map(p => p.slug)
  const i = slugs.indexOf('contas-a-pagar')
  assert.ok(i >= 0)
  assert.equal(slugs[i + 1], 'pagamentos')
})

test('página Contas a Pagar: só em aberto, em blocos, sem limit', () => {
  const src = ler('app/financeiro/contas-a-pagar/page.tsx')
  assert.match(src, /\.eq\('pago', false\)/)
  assert.match(src, /buscarEmBlocos/)
  assert.doesNotMatch(src, /\.limit\(/)
})

test('janela de edição de conta usa atualizarConta e trava o tipo', () => {
  const src = ler('components/financeiro/NovoMovimentoModal.tsx')
  assert.match(src, /atualizarConta/)
  assert.match(src, /Editar conta/)
  assert.match(src, /Vencimento/)
})

test('contaApareceNoMes: o mês escolhido e o vencido de antes, não o intermediário', () => {
  // Hoje 07/10/2026, seletor em dezembro/2026.
  const primeiro = '2026-12-01', hoje = '2026-10-07'
  assert.equal(contaApareceNoMes('2026-12-10', primeiro, hoje), true)   // vence no mês escolhido
  assert.equal(contaApareceNoMes('2026-09-10', primeiro, hoje), true)   // vencida de antes
  assert.equal(contaApareceNoMes('2026-11-10', primeiro, hoje), false)  // meio do caminho, ainda não vence
  assert.equal(contaApareceNoMes('2026-10-07', primeiro, hoje), false)  // vence hoje, mês de outubro: fora de dezembro
})

test('financeiro-actions: desfazer só em conta e atualizarConta só em conta não paga', () => {
  const src = ler('lib/financeiro-actions.ts')
  const i = src.indexOf('export async function definirPagamentoConfirmado')
  const corpo = src.slice(i, src.indexOf('export async function', i + 10))
  assert.ok(corpo.includes(".or('recorrencia_id.not.is.null,competencia.not.is.null')"))
  const j = src.indexOf('export async function atualizarConta')
  assert.ok(j >= 0)
  assert.ok(src.slice(j, src.indexOf('export async function', j + 10)).includes(".eq('pago', false)"))
})
