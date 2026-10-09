// tests/relatorio-fiscal-agenda.test.ts — envio agendado dos relatórios do Fiscal (dia e horário de Parâmetros).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agoraSP, envioDevido, formatarChaveEnvio, JANELA_ENVIO_MIN, type MomentoSP, type RotinaConfig } from '../lib/relatorio-fiscal-agenda'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')
const em = (ano: number, mes: number, dia: number, hora: number, minuto: number): MomentoSP => ({ ano, mes, dia, hora, minuto })
const rotina = (dia: string, hora: string, extra: Partial<RotinaConfig> = {}): RotinaConfig => ({ ativo: true, dia, hora, ultimoEnvio: null, ...extra })

test('agoraSP lê o relógio de São Paulo, não o UTC', () => {
  assert.deepEqual(agoraSP(new Date('2026-10-14T19:20:00Z')), em(2026, 10, 14, 16, 20))
  // 01:30 UTC do dia 1º ainda é dia 31 em São Paulo
  assert.deepEqual(agoraSP(new Date('2026-11-01T01:30:00Z')), em(2026, 10, 31, 22, 30))
  assert.deepEqual(agoraSP(new Date('2026-10-14T03:05:00Z')), em(2026, 10, 14, 0, 5))
})

test('envia a partir do horário marcado, nunca antes', () => {
  const r = rotina('14', '16:20')
  assert.equal(envioDevido(r, em(2026, 10, 14, 16, 19)), null)
  assert.deepEqual(envioDevido(r, em(2026, 10, 14, 16, 20)), { chave: '202610141620', mes: 10, ano: 2026 })
  assert.deepEqual(envioDevido(r, em(2026, 10, 14, 16, 31)), { chave: '202610141620', mes: 10, ano: 2026 })
  assert.equal(envioDevido(r, em(2026, 10, 13, 23, 59)), null)
})

test('não repete o envio já feito e desiste depois da janela', () => {
  const feito = rotina('14', '16:20', { ultimoEnvio: '202610141620' })
  assert.equal(envioDevido(feito, em(2026, 10, 14, 16, 30)), null)
  // o do mês passado não impede o deste mês
  assert.equal(envioDevido(rotina('14', '16:20', { ultimoEnvio: '202609141620' }), em(2026, 10, 14, 16, 30))?.chave, '202610141620')
  const r = rotina('14', '16:20')
  assert.equal(JANELA_ENVIO_MIN, 720)
  assert.ok(envioDevido(r, em(2026, 10, 15, 4, 20)))
  assert.equal(envioDevido(r, em(2026, 10, 15, 4, 21)), null)
  // trocar o horário para um ainda dentro da janela vale como envio novo
  assert.equal(envioDevido(rotina('14', '17:00', { ultimoEnvio: '202610141620' }), em(2026, 10, 14, 17, 5))?.chave, '202610141700')
})

test('rotina desligada ou mal preenchida não envia', () => {
  const agora = em(2026, 10, 14, 16, 30)
  assert.equal(envioDevido(rotina('14', '16:20', { ativo: false }), agora), null)
  for (const dia of ['', '0', '32', 'x', '1.5']) assert.equal(envioDevido(rotina(dia, '00:00'), em(2026, 10, 1, 0, 5)), null, dia)
  for (const hora of ['', '25:00', '16h20', '16:7']) assert.equal(envioDevido(rotina('14', hora), agora), null, hora)
  assert.equal(envioDevido(rotina('14', '16:20:00'), agora)?.chave, '202610141620')
  assert.equal(envioDevido(rotina('14', '8:05'), em(2026, 10, 14, 8, 10))?.chave, '202610140805')
})

test('dia que não existe no mês vale como o último dia', () => {
  assert.deepEqual(envioDevido(rotina('31', '08:00'), em(2026, 11, 30, 8, 5)), { chave: '202611300800', mes: 11, ano: 2026 })
  assert.equal(envioDevido(rotina('30', '08:00'), em(2026, 2, 28, 8, 0))?.chave, '202602280800')
  assert.equal(envioDevido(rotina('30', '08:00'), em(2028, 2, 29, 8, 0))?.chave, '202802290800')
  assert.equal(envioDevido(rotina('31', '08:00'), em(2026, 11, 29, 8, 5)), null)
})

test('horário marcado perto da meia-noite do último dia sai na virada, com o mês certo', () => {
  assert.deepEqual(envioDevido(rotina('31', '23:55'), em(2026, 11, 1, 0, 5)), { chave: '202610312355', mes: 10, ano: 2026 })
  assert.deepEqual(envioDevido(rotina('31', '23:55'), em(2027, 1, 1, 0, 5)), { chave: '202612312355', mes: 12, ano: 2026 })
})

test('formatarChaveEnvio mostra dia e hora', () => {
  assert.equal(formatarChaveEnvio('202610141620'), '14/10/2026 às 16:20')
  assert.equal(formatarChaveEnvio(''), '')
  assert.equal(formatarChaveEnvio(null), '')
  assert.equal(formatarChaveEnvio('2026-10-14'), '')
})

test('rota agendada: protegida por CRON_SECRET e liberada no proxy', () => {
  const rota = ler('app/api/cron/fiscal-relatorios/route.ts')
  assert.ok(rota.includes("if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`)"))
  assert.ok(rota.includes('enviarRelatoriosFiscalAgendados(createAdminClient())'))
  assert.ok(ler('proxy.ts').includes("pathname.startsWith('/api/cron/')"))
})

test('envio agendado: respeita "Envio ligado", reserva antes de mandar e devolve se falhar', () => {
  const src = ler('lib/relatorio-fiscal-envio.ts')
  assert.ok(src.includes("if (!ligado(s.email_ativo)) return { status: 'desligado' }"))
  assert.ok(src.includes('.or(`${coluna}.is.null,${coluna}.neq.${d.envio.chave}`)'))
  assert.ok(src.indexOf('.update({ [coluna]: d.envio.chave })') < src.indexOf('resultado = await enviarRelatoriosFiscal(admin, { mes, ano })'))
  assert.equal(src.split('await devolver()').length - 1, 2)
})

test('botão "Enviar relatórios agora" usa o mesmo envio e segue só para admin', () => {
  const rota = ler('app/api/relatorios/fiscal/route.ts')
  assert.ok(rota.includes("if (profile?.role !== 'admin')"))
  assert.ok(rota.includes('enviarRelatoriosFiscal(createAdminClient(), getMesAnoRealAgora())'))
})

test('Parâmetros só grava o que a tela edita', () => {
  const actions = ler('app/fiscal/parametros/actions.ts')
  assert.ok(actions.includes('CONFIGURACOES_EDITAVEIS.includes(chave)'))
  assert.ok(actions.includes(".update(permitidos).eq('id', 1)"))
  const lista = actions.slice(actions.indexOf('const CONFIGURACOES_EDITAVEIS'), actions.indexOf('export async function salvarConfiguracoes'))
  for (const t of ['gmail_', 'ultimo_envio', 'dashboard_announcement']) assert.ok(!lista.includes(t), t)
})

test('agendador: cron diário da Vercel às 08h de São Paulo e GitHub Actions de reserva', () => {
  const wf = ler('.github/workflows/relatorios-fiscal.yml')
  assert.ok(wf.includes("- cron: '*/10 * * * *'"))
  assert.ok(wf.includes('https://app.tesseratocontabilidade.com/api/cron/fiscal-relatorios'))
  assert.ok(wf.includes('-H "Authorization: Bearer $CRON_SECRET"'))
  // Plano gratuito da Vercel: cada cron roda no máximo uma vez por dia (expressão
  // mais frequente quebra o deploy) e dispara em algum minuto da hora marcada.
  const crons: { path: string; schedule: string }[] = JSON.parse(ler('vercel.json')).crons
  assert.deepEqual(crons.filter(c => c.path === '/api/cron/fiscal-relatorios'), [
    { path: '/api/cron/fiscal-relatorios', schedule: '0 11 * * *' }, // 11h UTC = 08h em São Paulo
  ])
  for (const c of crons) assert.match(c.schedule, /^\d+ \d+ \* \* \*$/, `${c.path}: só uma vez por dia`)
})

test('rotina das 08:00 sai em qualquer minuto da janela do cron da Vercel (08:00 a 08:59)', () => {
  const rotina = { ativo: true, dia: '14', hora: '08:00', ultimoEnvio: null }
  for (const minuto of [0, 30, 59]) {
    assert.deepEqual(envioDevido(rotina, { ano: 2026, mes: 10, dia: 14, hora: 8, minuto }), { chave: '202610140800', mes: 10, ano: 2026 })
  }
  // Depois de enviado, a rodada de reserva do GitHub não repete.
  assert.equal(envioDevido({ ...rotina, ultimoEnvio: '202610140800' }, { ano: 2026, mes: 10, dia: 14, hora: 12, minuto: 5 }), null)
})

test('migration 067: controle do envio e limpeza da senha do Gmail', () => {
  const sql = ler('supabase/migrations/067_relatorios_fiscal_agendados.sql')
  for (const t of ['add column if not exists rotina1_ultimo_envio text', 'add column if not exists rotina2_ultimo_envio text',
    "set gmail_remetente = '', gmail_senha = '' where id = 1", "set local lock_timeout = '5s'"]) assert.ok(sql.includes(t), t)
})
