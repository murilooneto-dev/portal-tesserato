'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, Building2, CreditCard, Wrench, Settings,
  type LucideIcon,
} from 'lucide-react'

interface NavItem { href: string; label: string; icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { href: '/fiscal/intranet',      label: 'Intranet',      icon: Zap        },
  { href: '/fiscal/dashboard',     label: 'Dashboard',     icon: LayoutGrid },
  { href: '/fiscal/clientes',      label: 'Clientes',      icon: Users      },
  { href: '/fiscal/calendario',    label: 'Calendário',    icon: Calendar   },
  { href: '/fiscal/relatorios',    label: 'Relatórios',    icon: FileText   },
  { href: '/fiscal/historico',     label: 'Histórico',     icon: TrendingUp },
  { href: '/fiscal/empresas',      label: 'Empresas',      icon: Building2  },
  { href: '/fiscal/parcelamentos', label: 'Parcelamentos', icon: CreditCard },
  { href: '/fiscal/ferramentas',   label: 'Ferramentas',   icon: Wrench     },
]

interface Props {
  profile: Profile
}

export default function Sidebar({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="w-56 h-screen shrink-0 border-r border-white/7 flex flex-col overflow-y-auto"
      style={{
        background: 'linear-gradient(180deg, #0d1320 0%, #0a1028 100%)',
        backgroundImage: 'linear-gradient(180deg, #0d1320 0%, #0a1028 100%), radial-gradient(circle, rgba(0,184,212,0.045) 1px, transparent 1px)',
        backgroundSize: 'auto, 18px 18px',
      }}
    >
      <div className="px-4 py-4 border-b border-white/7">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Tesserato"
            width={32}
            height={32}
            className="rounded-lg shrink-0"
            unoptimized
          />
          <div>
            <p className="text-white text-xs font-bold tracking-wide leading-tight">Tesserato</p>
            <p className="text-white/30 text-[10px] leading-tight">Setor Fiscal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? 'bg-[#00B8D4]/15 text-[#00B8D4] font-medium'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon size={15} strokeWidth={1.75} />
              {item.label}
            </Link>
          )
        })}

        {profile.role === 'admin' && (
          <>
            <div className="my-2 border-t border-white/8" />
            <p className="px-3 text-white/20 text-[10px] uppercase tracking-wider mb-1">Admin</p>
            <Link
              href="/fiscal/parametros"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                pathname.startsWith('/fiscal/parametros')
                  ? 'bg-[#00B8D4]/15 text-[#00B8D4] font-medium'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings size={15} strokeWidth={1.75} />
              Parâmetros
            </Link>
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/8">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {(profile.nome ?? 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{profile.nome}</p>
            <p className="text-white/30 text-xs capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-white/30 text-xs hover:text-white/60 transition-colors px-1"
        >
          Sair →
        </button>
      </div>
    </aside>
  )
}
