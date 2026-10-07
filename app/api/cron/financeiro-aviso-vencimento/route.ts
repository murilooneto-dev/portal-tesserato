import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarAvisoVencimento } from '@/lib/financeiro-aviso-vencimento-envio'

// Rotina diária (vercel.json → crons): a Vercel chama esta rota com
// "Authorization: Bearer <CRON_SECRET>". Não há usuário logado aqui — por isso
// o proxy.ts deixa /api/cron/ passar e a única proteção é esse segredo. Sem a
// variável CRON_SECRET configurada, a rota recusa tudo.
// Faz duas coisas, nesta ordem: renova as contas dos pagamentos recorrentes
// (financeiro_renovar_recorrentes) e manda o aviso das contas a pagar que
// vencem amanhã. Falha em uma não impede a outra.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  let renovadas: number | null = null
  let renovacaoFalhas: number | null = null
  try {
    const { data, error } = await admin.rpc('financeiro_renovar_recorrentes')
    if (error) throw new Error(error.message)
    const resultado = data as { criadas: number; falhas: number }
    renovadas = Number(resultado.criadas)
    renovacaoFalhas = Number(resultado.falhas)
    if (renovacaoFalhas > 0) console.error(`Renovação das contas recorrentes: ${renovacaoFalhas} tipo(s) falharam`)
  } catch (e) {
    console.error('Renovação das contas recorrentes falhou:', e)
  }

  const falhas = renovacaoFalhas ? { renovacao_falhas: renovacaoFalhas } : {}
  try {
    const resultado = await enviarAvisoVencimento(admin)
    return NextResponse.json({ ...resultado, renovadas, ...falhas })
  } catch (e) {
    console.error('Aviso de vencimento do Financeiro falhou:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha no envio.', renovadas, ...falhas }, { status: 500 })
  }
}
