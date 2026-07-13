import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function PessoalLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="pessoal">
      {children}
    </PortalShell>
  )
}
