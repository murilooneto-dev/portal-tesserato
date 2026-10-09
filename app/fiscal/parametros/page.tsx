import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
import ParametrosClient from './ParametrosClient'

export const metadata = { title: 'Parâmetros — Tesserato Fiscal' }

export default async function ParametrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  const [
    { data: profiles },
    { data: appSettings },
    catalogoFiscal,
    { data: regimesRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('nome'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    buscarCatalogoCliente(supabase, 'fiscal'),
    supabase.from('minhas_tarefas_regimes').select('user_id, regimes').eq('setor', 'fiscal'),
  ])

  // Regimes que cada usuário atende em Minhas Tarefas (Fiscal); sem linha = todos.
  const regimesPorUsuario: Record<string, string[]> = {}
  for (const l of regimesRaw ?? []) regimesPorUsuario[l.user_id as string] = (l.regimes ?? []) as string[]

  const s = (appSettings as Record<string, unknown> | null) ?? {}
  const emailKeys = [
    'email_ativo','email_destinatario',
    'rotina1_ativo','rotina1_dia','rotina1_hora','rotina1_ultimo_envio',
    'rotina2_ativo','rotina2_dia','rotina2_hora','rotina2_ultimo_envio',
  ]
  const emailSettings: Record<string, string> = {}
  for (const k of emailKeys) { if (s[k] != null) emailSettings[k] = String(s[k]) }

  return (
    <>
      <ParametrosClient
        profiles={profiles ?? []}
        currentUserId={user.id}
        regimesCatalogo={catalogoFiscal.regimes}
        regimesPorUsuario={regimesPorUsuario}
        dashboardAnnouncement={typeof s.dashboard_announcement === 'string' ? s.dashboard_announcement : ''}
        emailSettings={emailSettings}
      />
    </>
  )
}
