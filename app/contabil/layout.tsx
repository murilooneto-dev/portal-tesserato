import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function ContabilLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext('contabil')

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="contabil">
      {children}
    </PortalShell>
  )
}
