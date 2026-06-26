import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/fiscal/Sidebar'

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar profile={safeProfile} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
