import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  if (profile?.role !== 'admin') redirect('/fiscal/intranet')

  const [
    { data: profiles },
    { data: appSettings },
    { data: taskLogs },
    { data: deletionLogs },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('nome'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('deletion_log').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  const s = (appSettings as any) ?? {}
  const emailKeys = [
    'email_ativo','gmail_remetente','gmail_senha','email_destinatario','usar_senha_app',
    'rotina1_ativo','rotina1_dia','rotina1_hora',
    'rotina2_ativo','rotina2_dia','rotina2_hora',
    'log1_ativo','log1_dia','log1_hora',
    'log2_ativo','log2_dia','log2_hora',
    'log3_ativo','log3_dia','log3_hora',
    'log4_ativo','log4_dia','log4_hora',
  ]
  const emailSettings: Record<string, string> = {}
  for (const k of emailKeys) { if (s[k] != null) emailSettings[k] = String(s[k]) }

  return (
    <ParametrosClient
      profiles={profiles ?? []}
      dashboardAnnouncement={s.dashboard_announcement ?? ''}
      taskLogs={taskLogs ?? []}
      deletionLogs={deletionLogs ?? []}
      emailSettings={emailSettings}
    />
  )
}
