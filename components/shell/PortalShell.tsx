// components/shell/PortalShell.tsx — casca de todas as telas (servidor).
// O menu é calculado aqui, no servidor, com as mesmas regras de permissão
// que o proxy usa; o ShellCliente só desenha.
import { MesAnoProvider } from '@/lib/mes-atual-context'
import { montarMenu, setoresVisiveis, atalhosCelular } from '@/lib/navegacao'
import type { Profile, UserSetor } from '@/lib/types'
import { ShellCliente } from './ShellCliente'

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  children: React.ReactNode
}

export default function PortalShell({ profile, mes, ano, setorAtivo, children }: Props) {
  const grupos = montarMenu(profile, setorAtivo)
  return (
    <MesAnoProvider mes={mes} ano={ano}>
      <ShellCliente
        profile={profile}
        mes={mes}
        ano={ano}
        setorAtivo={setorAtivo}
        grupos={grupos}
        setores={setoresVisiveis(profile)}
        atalhos={atalhosCelular(grupos)}
      >
        {children}
      </ShellCliente>
    </MesAnoProvider>
  )
}
