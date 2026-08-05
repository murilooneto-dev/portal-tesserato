'use client'

import { useState } from 'react'
import { adminLogout } from '@/app/admin/bloqueio/actions'

// Encerra apenas a sessão `ts_admin` (step-up da seção ADMIN) — a sessão
// do portal continua ativa. Visualmente distinto do "Sair" do TopNav para
// não ser confundido com o logout do portal (ver DESIGN.md).
export default function SairAdminButton() {
  const [saindo, setSaindo] = useState(false)

  async function handleSair() {
    setSaindo(true)
    await adminLogout()
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
      <span className="text-amber-400 font-medium">Você está na área ADMIN</span>
      <button
        onClick={handleSair}
        disabled={saindo}
        className="text-[var(--fg)]/50 hover:text-[var(--fg)]/80 px-2 py-1 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all disabled:opacity-50"
      >
        {saindo ? 'Saindo...' : 'Sair da área ADMIN'}
      </button>
    </div>
  )
}
