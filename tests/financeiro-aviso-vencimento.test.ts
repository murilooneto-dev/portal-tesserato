// tests/financeiro-aviso-vencimento.test.ts — aviso por e-mail das contas a pagar que vencem amanhã.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diaSeguinte, formatarDataBR, montarEmailAviso, separarEmails } from '../lib/financeiro-aviso-vencimento'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

test('diaSeguinte vira o mês, o ano e respeita ano bissexto', () => {
  assert.equal(diaSeguinte('2026-10-06'), '2026-10-07')
  assert.equal(diaSeguinte('2026-10-31'), '2026-11-01')
  assert.equal(diaSeguinte('2026-12-31'), '2027-01-01')
  assert.equal(diaSeguinte('2028-02-28'), '2028-02-29')
  assert.equal(diaSeguinte('2026-02-28'), '2026-03-01')
  assert.equal(diaSeguinte('ontem'), '')
})

test('formatarDataBR troca para dd/mm/aaaa', () => {
  assert.equal(formatarDataBR('2026-10-07'), '07/10/2026')
})

test('separarEmails aceita vírgula, ponto e vírgula e quebra de linha, sem repetir', () => {
  assert.deepEqual(separarEmails(' a@x.com, b@y.com.br;A@X.com\nc@z.org '), {
    validos: ['a@x.com', 'b@y.com.br', 'c@z.org'],
    invalidos: [],
  })
  assert.deepEqual(separarEmails('a@x.com, sem-arroba, b@y'), { validos: ['a@x.com'], invalidos: ['sem-arroba', 'b@y'] })
  assert.deepEqual(separarEmails(''), { validos: [], invalidos: [] })
  assert.deepEqual(separarEmails(null), { validos: [], invalidos: [] })
})

test('montarEmailAviso lista Pagamento, Data de vencimento e Valor, com o total', () => {
  const { subject, text, html } = montarEmailAviso([
    { tipo: 'Aluguel', observacao: 'Sala 2', data: '2026-10-07', valor: 1750 },
    { tipo: 'Internet <fibra>', observacao: null, data: '2026-10-07', valor: 199.9 },
  ], '2026-10-07')

  assert.equal(subject, 'Pagamentos que vencem amanhã (07/10)')
  assert.match(text, /2 contas a pagar vencem amanhã, 07\/10\/2026, e ainda não foram pagas:/)
  assert.match(text, /- Aluguel · Sala 2 \| 07\/10\/2026 \| R\$\s1\.750,00/)
  assert.match(text, /Total: R\$\s1\.949,90/)
  for (const coluna of ['Pagamento', 'Data de vencimento', 'Valor']) assert.ok(html.includes(`>${coluna}</th>`))
  assert.ok(html.includes('Aluguel · Sala 2'))
  assert.ok(html.includes('Internet &lt;fibra&gt;'), 'texto digitado pelo usuário é escapado no HTML')
  assert.ok(!html.includes('<fibra>'))
})

test('montarEmailAviso: um só pagamento no singular; teste marca o assunto e aceita lista vazia', () => {
  const um = montarEmailAviso([{ tipo: 'Aluguel', observacao: null, data: '2026-10-07', valor: 10 }], '2026-10-07')
  assert.match(um.text, /^1 conta a pagar vence amanhã, 07\/10\/2026, e ainda não foi paga:/)

  const vazio = montarEmailAviso([], '2026-10-07', { teste: true })
  assert.equal(vazio.subject, '[Teste] Pagamentos que vencem amanhã (07/10)')
  assert.match(vazio.text, /Nenhuma conta a pagar vence em 07\/10\/2026\./)
})

test('envio: toda saída não paga (não só recorrente), reserva o dia antes de mandar e devolve se falhar', () => {
  const src = ler('lib/financeiro-aviso-vencimento-envio.ts')
  assert.ok(src.includes(".eq('natureza', 'saida')"))
  assert.ok(src.includes(".eq('pago', false)"))
  assert.ok(!src.includes('recorrencia_id'), 'não filtra mais só o recorrente')
  assert.ok(src.includes(".eq('data', vencimento)"))
  assert.ok(src.indexOf('aviso_vencimento_ultimo_envio.lt.') < src.lastIndexOf('await enviarEmail('), 'reserva vem antes do envio')
  assert.ok(src.includes('update({ aviso_vencimento_ultimo_envio: anterior })'))
})

test('rota agendada exige CRON_SECRET, passa pelo proxy sem sessão e está no vercel.json', () => {
  const rota = ler('app/api/cron/financeiro-aviso-vencimento/route.ts')
  assert.ok(rota.includes('process.env.CRON_SECRET'))
  assert.ok(rota.includes('!segredo ||'), 'sem a variável configurada, recusa tudo')
  assert.ok(rota.includes('status: 401'))
  assert.ok(rota.includes("rpc('financeiro_renovar_recorrentes')"), 'renova as contas recorrentes antes do e-mail')
  assert.ok(rota.indexOf('financeiro_renovar_recorrentes') < rota.indexOf('enviarAvisoVencimento(admin)'))
  assert.ok(rota.includes('renovadas = Number(resultado.criadas)'), 'renovadas = criadas')
  assert.ok(rota.includes('renovacao_falhas'), 'falhas da renovação aparecem na resposta')
  assert.ok(rota.includes('tipo(s) falharam'), 'falhas da renovação vão para o log')
  assert.ok(rota.includes('renovadas, ...falhas }, { status: 500 }'), 'o 500 também leva renovadas')
  assert.ok(ler('proxy.ts').includes("pathname.startsWith('/api/cron/')"))

  const vercel = JSON.parse(ler('vercel.json'))
  assert.deepEqual(
    vercel.crons.filter((c: { path: string }) => c.path === '/api/cron/financeiro-aviso-vencimento'),
    [{ path: '/api/cron/financeiro-aviso-vencimento', schedule: '0 11 * * *' }],
  )
})

test('configuração: só admin lê, grava e testa; aba ligada na tela do Financeiro', () => {
  const actions = ler('lib/financeiro-actions.ts')
  for (const nome of ['lerEmailAvisoVencimento', 'salvarEmailAvisoVencimento', 'enviarTesteAvisoVencimento']) {
    const corpo = actions.slice(actions.indexOf(`export async function ${nome}`))
    assert.ok(corpo.slice(0, corpo.indexOf('\n}\n')).includes('await exigirAdmin()'), `${nome} exige admin`)
  }
  assert.ok(ler('app/admin/configuracoes/financeiro/FinanceiroConfigClient.tsx').includes('<AvisoVencimentoTab />'))

  const migration = ler('supabase/migrations/062_financeiro_aviso_vencimento.sql')
  assert.ok(migration.includes('enable row level security'))
  assert.ok(migration.includes('using (is_admin()) with check (is_admin())'))
})
