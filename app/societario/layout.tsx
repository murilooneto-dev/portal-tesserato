import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function SocietarioLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext('societario')

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="societario">
      {children}
    </PortalShell>
  )
}
