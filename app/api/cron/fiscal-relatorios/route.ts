import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarRelatoriosFiscalAgendados } from '@/lib/relatorio-fiscal-envio'

// Envio agendado dos relatórios do Fiscal. Dois agendadores chamam esta rota,
// os dois com "Authorization: Bearer <CRON_SECRET>":
// - o cron da Vercel (vercel.json), uma vez por dia entre 08:00 e 08:59 de São
//   Paulo (o plano gratuito só roda cron diário e escolhe o minuto dentro da
//   hora). É ele que garante a rotina marcada para as 08:00 chegar de manhã;
// - o GitHub Actions (.github/workflows/relatorios-fiscal.yml), agendado a cada
//   10 minutos, que cobre os outros horários de Parâmetros. Na prática o GitHub
//   espaça as rodadas em horas, então nesses horários o envio pode atrasar.
// A chave do último envio impede que um repita o que o outro já mandou.
// Não há usuário logado aqui — o proxy.ts deixa /api/cron/ passar e a única
// proteção é esse segredo. Sem a variável CRON_SECRET, a rota recusa tudo.
// A rota só manda quando alguma rotina de Parâmetros está na hora; nas outras
// chamadas responde "nada_agora".
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    return NextResponse.json(await enviarRelatoriosFiscalAgendados(createAdminClient()))
  } catch (e) {
    console.error('Envio agendado dos relatórios do Fiscal falhou:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha no envio.' }, { status: 500 })
  }
}
