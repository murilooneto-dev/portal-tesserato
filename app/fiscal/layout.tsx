import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TopNav from '@/components/fiscal/TopNav'

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
    <div className="min-h-screen bg-[#0d1320] flex flex-col">
      <TopNav profile={safeProfile} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
