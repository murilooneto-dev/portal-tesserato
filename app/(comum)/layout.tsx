import { getPortalContext } from '@/lib/get-portal-context'
import { getSetorAtivo } from '@/lib/setor-ativo-server'
import PortalShell from '@/components/shell/PortalShell'

export default async function ComumLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()
  const setorAtivo = await getSetorAtivo(profile.setores[0] ?? 'fiscal')

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo={setorAtivo}>
      {children}
    </PortalShell>
  )
}
