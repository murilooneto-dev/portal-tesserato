'use client'

import { useState } from 'react'

interface SectorSectionProps {
  title: string
  note?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export default function SectorSection({ title, note, defaultOpen = false, children }: SectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">{title}</p>
          {note && <p className="text-[10px] text-[var(--fg)]/30 mt-0.5">{note}</p>}
        </div>
        <svg
          className={`w-4 h-4 text-[var(--fg)]/40 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}
