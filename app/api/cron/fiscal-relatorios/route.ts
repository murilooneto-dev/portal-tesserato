import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarRelatoriosFiscalAgendados } from '@/lib/relatorio-fiscal-envio'

// Envio agendado dos relatórios do Fiscal. Quem chama é o GitHub Actions
// (.github/workflows/relatorios-fiscal.yml), a cada 10 minutos, com
// "Authorization: Bearer <CRON_SECRET>": o cron da Vercel no plano gratuito só
// roda uma vez por dia e não serviria para o horário escolhido em Parâmetros.
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
