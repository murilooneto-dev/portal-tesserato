import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSection } from '@/lib/admin-auth/server'
import SairAdminButton from '@/components/admin/SairAdminButton'
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

  // Guarda autoritativa da seção ADMIN (RNF2/RN1/CA5) — o proxy.ts já
  // intercepta a navegação, mas a verificação aqui, antes de qualquer
  // query, é a que realmente protege os dados desta página.
  await requireAdminSection('/fiscal/parametros')

  const [
    { data: profiles },
    { data: appSettings },
    { data: taskLogs },
    { data: deletionLogs },
    { data: atividadeTemplates },
    { data: grupoTemplatesRows },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('nome'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('deletion_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('atividade_templates').select('atividade,tarefas'),
    supabase.from('grupo_templates').select('grupo,tarefas'),
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

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  const grupoTemplatesMap: Record<string, string[]> = {}
  for (const row of grupoTemplatesRows ?? []) {
    grupoTemplatesMap[row.grupo] = row.tarefas ?? []
  }

  return (
    <>
      <SairAdminButton />
      <ParametrosClient
        profiles={profiles ?? []}
        currentUserId={user.id}
        dashboardAnnouncement={s.dashboard_announcement ?? ''}
        taskLogs={taskLogs ?? []}
        deletionLogs={deletionLogs ?? []}
        emailSettings={emailSettings}
        atividadeTemplates={templatesMap}
        grupoTemplates={grupoTemplatesMap}
      />
    </>
  )
}
