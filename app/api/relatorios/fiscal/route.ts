import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { enviarRelatoriosFiscal } from '@/lib/relatorio-fiscal-envio'
import { getMesAnoRealAgora } from '@/lib/mes-atual'

// Botão "Enviar relatórios agora" de Parâmetros: manda os relatórios do mês
// corrente na hora, só para administrador. O envio agendado (dia e horário
// das rotinas) fica em app/api/cron/fiscal-relatorios.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem enviar os relatórios.' }, { status: 403 })

  const resultado = await enviarRelatoriosFiscal(createAdminClient(), getMesAnoRealAgora())
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  return NextResponse.json({ ok: true, enviados: resultado.enviados, responsaveis: resultado.responsaveis })
}
