'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SETORES, SETOR_LABEL, SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { SETOR_ATIVO_COOKIE } from '@/lib/setor-ativo'

interface Props {
  profile: Profile
  setorAtivo: UserSetor
}

export default function TopNav({ profile, setorAtivo }: Props) {
  const router = useRouter()

  const setoresVisiveis = profile.role === 'admin' ? SETORES : profile.setores

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function trocarSetor(setor: UserSetor) {
    document.cookie = `${SETOR_ATIVO_COOKIE}=${setor}; path=/; max-age=${60 * 60 * 24 * 365}`
    router.push(SETOR_HOME[setor])
  }

  return (
    <header className="bg-[var(--bg-surface-2)] border-b border-[var(--fg)]/8 flex items-center gap-0 h-12 px-4 shrink-0 z-40">
      <div className="flex items-center gap-2 pr-4 border-r border-[var(--fg)]/8 shrink-0">
        <Image src="/logo.ico" alt="Tesserato" width={24} height={24} className="rounded-md" />
        <p className="text-[var(--fg)] text-xs font-bold tracking-wide">Tesserato</p>
      </div>

      <nav className="flex items-center gap-1 px-3 flex-1 overflow-x-auto">
        {setoresVisiveis.map(setor => (
          <button
            key={setor}
            onClick={() => trocarSetor(setor)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              setor === setorAtivo
                ? 'bg-[var(--accent)] text-[var(--fg)]'
                : 'text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/6'
            }`}
          >
            {SETOR_LABEL[setor]}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3 pl-4 border-l border-[var(--fg)]/8 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--fg)] text-[10px] font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {(profile.nome ?? 'U').charAt(0).toUpperCase()}
          </div>
          <span className="text-[var(--fg)]/70 text-sm">{profile.nome}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/70 px-2.5 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
