import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/fiscal/Sidebar'
import { getMesAno } from '@/lib/mes-atual-server'
import { MesAnoProvider } from '@/lib/mes-atual-context'

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador' as const,
    cor: '#6366f1',
    setor: 'fiscal' as const,
    created_at: new Date().toISOString(),
  }

  const { mes, ano } = await getMesAno()

  return (
    <MesAnoProvider mes={mes} ano={ano}>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-page)]">
        <Sidebar profile={safeProfile} mes={mes} ano={ano} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </MesAnoProvider>
  )
}
