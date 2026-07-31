// components/shell/PortalShell.tsx
import Sidebar from '@/components/fiscal/Sidebar'
import TopNav from '@/components/fiscal/TopNav'
import { MesAnoProvider } from '@/lib/mes-atual-context'
import type { Profile, UserSetor } from '@/lib/types'

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  children: React.ReactNode
}

export default function PortalShell({ profile, mes, ano, setorAtivo, children }: Props) {
  const mostraTopNav = profile.role === 'admin' || profile.setores.length > 1

  return (
    <MesAnoProvider mes={mes} ano={ano}>
      <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-page)]">
        {mostraTopNav && <TopNav profile={profile} setorAtivo={setorAtivo} />}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar profile={profile} mes={mes} ano={ano} setorAtivo={setorAtivo} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </MesAnoProvider>
  )
}
