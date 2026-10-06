import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarAvisoVencimento } from '@/lib/financeiro-aviso-vencimento-envio'

// Envio agendado (vercel.json → crons): todo dia a Vercel chama esta rota com
// "Authorization: Bearer <CRON_SECRET>". Não há usuário logado aqui — por isso
// o proxy.ts deixa /api/cron/ passar e a única proteção é esse segredo. Sem a
// variável CRON_SECRET configurada, a rota recusa tudo.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const resultado = await enviarAvisoVencimento(createAdminClient())
    return NextResponse.json(resultado)
  } catch (e) {
    console.error('Aviso de vencimento do Financeiro falhou:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha no envio.' }, { status: 500 })
  }
}
