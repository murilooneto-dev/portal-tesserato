'use client'

import { useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/lib/theme'
import { SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { SETOR_ATIVO_COOKIE } from '@/lib/setor-ativo'
import type { GrupoMenu, ItemMenu } from '@/lib/navegacao'
import { BarraTopo } from './BarraTopo'
import { MenuLateral } from './MenuLateral'
import { GavetaMenu } from './GavetaMenu'
import { BarraInferior } from './BarraInferior'
import SeletorMes from './SeletorMes'

export function ShellCliente({ profile, mes, ano, setorAtivo, grupos, setores, atalhos, children }: {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  grupos: GrupoMenu[]
  setores: UserSetor[]
  atalhos: ItemMenu[]
  children: ReactNode
}) {
  const pathname = usePathname() ?? '/'
  // Na ficha do Contábil o mês sai da barra do topo: quem escolhe é o seletor da própria ficha.
  const fichaContabil = /^\/contabil\/clientes\/[^/]+$/.test(pathname)
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [menuAberto, setMenuAberto] = useState(false)

  // Qualquer navegação (inclusive voltar/avançar) fecha a gaveta. Ajuste de estado na renderização:
  // o lint do projeto proíbe setState direto dentro de useEffect.
  const [pathAnterior, setPathAnterior] = useState(pathname)
  if (pathAnterior !== pathname) {
    setPathAnterior(pathname)
    setMenuAberto(false)
  }

  async function sair() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function trocarSetor(setor: UserSetor) {
    document.cookie = `${SETOR_ATIVO_COOKIE}=${setor}; path=/; max-age=${60 * 60 * 24 * 365}`
    setMenuAberto(false)
    router.push(SETOR_HOME[setor])
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page print:h-auto print:overflow-visible">
      <BarraTopo
        profile={profile}
        setores={setores}
        setorAtivo={setorAtivo}
        tema={theme}
        seletorMes={fichaContabil ? null : <SeletorMes mes={mes} ano={ano} />}
        onTrocarSetor={trocarSetor}
        onAlternarTema={toggleTheme}
        onSair={sair}
        onAbrirMenu={() => setMenuAberto(true)}
        menuAberto={menuAberto}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden print:overflow-visible">
        <aside className="hidden w-[248px] shrink-0 border-r border-line-soft bg-nav print:hidden lg:flex lg:flex-col">
          <MenuLateral grupos={grupos} pathname={pathname} />
        </aside>
        <main id="conteudo" className="min-w-0 flex-1 overflow-y-auto pb-16 print:h-auto print:overflow-visible print:pb-0 lg:pb-0">
          {children}
        </main>
      </div>
      <GavetaMenu
        aberto={menuAberto}
        onFechar={() => setMenuAberto(false)}
        profile={profile}
        grupos={grupos}
        pathname={pathname}
        setores={setores}
        setorAtivo={setorAtivo}
        tema={theme}
        onTrocarSetor={trocarSetor}
        onAlternarTema={toggleTheme}
        onSair={sair}
      />
      <BarraInferior atalhos={atalhos} pathname={pathname} onMais={() => setMenuAberto(true)} menuAberto={menuAberto} />
    </div>
  )
}
