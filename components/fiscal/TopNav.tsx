'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

const NAV_ITEMS = [
  { href: '/fiscal/intranet',      label: 'Intranet'      },
  { href: '/fiscal/dashboard',     label: 'Dashboard'     },
  { href: '/fiscal/clientes',      label: 'Clientes'      },
  { href: '/fiscal/calendario',    label: 'Calendário'    },
  { href: '/fiscal/relatorios',    label: 'Relatórios'    },
  { href: '/fiscal/historico',     label: 'Histórico'     },
  { href: '/fiscal/empresas',      label: 'Empresas'      },
  { href: '/fiscal/parcelamentos', label: 'Parcelamentos' },
  { href: '/fiscal/ferramentas',   label: 'Ferramentas'   },
]

interface Props { profile: Profile }

export default function TopNav({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-[#0a0f1a] border-b border-white/8 flex items-center gap-0 h-14 px-4 shrink-0 sticky top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 pr-5 border-r border-white/8 shrink-0">
        <Image
          src="/logo.ico"
          alt="Tesserato"
          width={30}
          height={30}
          className="rounded-md"
        />
        <div className="leading-tight">
          <p className="text-white text-xs font-bold tracking-wide">Setor Fiscal</p>
          <p className="text-white/30 text-[10px]">Tesserato Contabilidade</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-0.5 px-3 overflow-x-auto flex-1 scrollbar-hide">
        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#00B8D4] text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/6'
              }`}
            >
              {item.label}
            </Link>
          )
        })}

        {profile.role === 'admin' && (
          <Link
            href="/fiscal/parametros"
            className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith('/fiscal/parametros')
                ? 'bg-[#00B8D4] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/6'
            }`}
          >
            Parâmetros
          </Link>
        )}
      </nav>

      {/* Usuário */}
      <div className="flex items-center gap-3 pl-4 border-l border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {profile.nome.charAt(0).toUpperCase()}
          </div>
          <span className="text-white/70 text-sm">{profile.nome}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-white/30 hover:text-white/70 px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
