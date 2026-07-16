'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'
import { useTheme } from '@/lib/theme'
import MesSeletor from './MesSeletor'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, CreditCard, Wrench, Settings, ShieldCheck, ClipboardCheck,
  Sun, Moon,
  type LucideIcon,
} from 'lucide-react'

interface NavItem { href: string; label: string; icon: LucideIcon }

const ITENS_COMUNS: NavItem[] = [
  { href: '/intranet',   label: 'Intranet',   icon: Zap   },
  { href: '/clientes',   label: 'Clientes',   icon: Users },
  { href: '/ferramentas', label: 'Ferramentas', icon: Wrench },
]

const ITENS_POR_SETOR: Record<UserSetor, NavItem[]> = {
  fiscal: [
    { href: '/fiscal/dashboard',     label: 'Dashboard',     icon: LayoutGrid     },
    { href: '/fiscal/clientes',      label: 'Clientes',      icon: Users          },
    { href: '/fiscal/calendario',    label: 'Calendário',    icon: Calendar       },
    { href: '/fiscal/relatorios',    label: 'Relatórios',    icon: FileText       },
    { href: '/fiscal/historico',     label: 'Histórico',     icon: TrendingUp     },
    { href: '/fiscal/parcelamentos', label: 'Parcelamentos', icon: CreditCard     },
    { href: '/fiscal/conferencia',   label: 'Conferência',   icon: ClipboardCheck },
  ],
  contabil: [
    { href: '/contabil/dashboard', label: 'Dashboard',     icon: LayoutGrid },
    { href: '/contabil/clientes',  label: 'Clientes',      icon: Users    },
    { href: '/contabil/calendario',label: 'Calendário',    icon: Calendar },
  ],
  pessoal:    [{ href: '/pessoal',    label: 'Em construção', icon: Wrench }],
  societario: [{ href: '/societario', label: 'Em construção', icon: Wrench }],
  financeiro: [{ href: '/financeiro', label: 'Em construção', icon: Wrench }],
}

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
        active
          ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
          : 'text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/5'
      }`}
    >
      <item.icon size={15} strokeWidth={1.75} />
      {item.label}
    </Link>
  )
}

export default function Sidebar({ profile, mes, ano, setorAtivo }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="w-56 h-full shrink-0 border-r border-[var(--fg)]/7 flex flex-col overflow-y-auto"
      style={{
        backgroundImage: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-page) 100%), radial-gradient(circle, rgba(0,204,235,0.045) 1px, transparent 1px)',
        backgroundSize: 'auto, 18px 18px',
      }}
    >
      <div className="px-4 py-4 border-b border-[var(--fg)]/7">
        <MesSeletor mes={mes} ano={ano} />
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">Comum</p>
        {ITENS_COMUNS.map(item => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}

        <div className="my-2 border-t border-[var(--fg)]/8" />
        <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">
          {SETOR_LABEL[setorAtivo]}
        </p>
        {ITENS_POR_SETOR[setorAtivo].map(item => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}

        {profile.role === 'admin' && (
          <>
            <div className="my-2 border-t border-[var(--fg)]/8" />
            <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">Admin</p>
            <NavLink item={{ href: '/fiscal/parametros', label: 'Parâmetros', icon: Settings }} active={pathname.startsWith('/fiscal/parametros')} />
            <NavLink item={{ href: '/fiscal/admin', label: 'Admin', icon: ShieldCheck }} active={pathname.startsWith('/fiscal/admin')} />
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--fg)]/8">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 text-left text-[var(--fg)]/40 hover:text-[var(--fg)]/70 text-xs transition-colors px-1 py-1.5 mb-2"
        >
          {theme === 'light' ? <Moon size={13} strokeWidth={1.75} /> : <Sun size={13} strokeWidth={1.75} />}
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--fg)] text-xs font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {(profile.nome ?? 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--fg)] text-sm font-medium truncate">{profile.nome}</p>
            <p className="text-[var(--fg)]/30 text-xs capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-[var(--fg)]/30 text-xs hover:text-[var(--fg)]/60 transition-colors px-1"
        >
          Sair →
        </button>
      </div>
    </aside>
  )
}
