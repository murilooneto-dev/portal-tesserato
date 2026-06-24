'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

const NAV_ITEMS = [
  { href: '/fiscal/intranet', label: 'Intranet', icon: '⚡' },
  { href: '/fiscal/clientes', label: 'Clientes', icon: '🏢' },
  { href: '/fiscal/tarefas',  label: 'Tarefas',  icon: '✓'  },
  { href: '/fiscal/bots',     label: 'Bots',     icon: '🤖' },
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
    <aside className="w-56 min-h-screen bg-[#0d1117] border-r border-white/8 flex flex-col">
      <div className="px-5 py-5 border-b border-white/8">
        <span className="text-white font-bold text-sm tracking-wide">TESSERATO</span>
        <p className="text-white/30 text-xs mt-0.5">Setor Fiscal</p>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
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
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {profile.role === 'admin' && (
          <Link
            href="/fiscal/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              pathname.startsWith('/fiscal/admin')
                ? 'bg-[#00B8D4]/15 text-[#00B8D4] font-medium'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>⚙️</span>
            Admin
          </Link>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/8">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {profile.nome.charAt(0).toUpperCase()}
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
