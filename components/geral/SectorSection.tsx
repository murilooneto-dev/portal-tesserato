'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/components/ui/cn'

interface SectorSectionProps {
  title: string
  note?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

// Bloco recolhível dentro de janelas (ex.: "Dados do Fiscal" na janela de cliente).
export default function SectorSection({ title, note, defaultOpen = false, children }: SectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className="overflow-hidden rounded-[10px] border border-line-soft">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        className="flex w-full flex-wrap items-center gap-x-2 px-3.5 py-3 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
      >
        <ChevronDown size={16} aria-hidden="true" className={cn('flex-none text-fg-3 transition-transform', !open && '-rotate-90')} />
        <span className="text-sm font-semibold text-fg">{title}</span>
        {note && <span className="text-[13px] text-fg-3">· {note}</span>}
      </button>
      {open && <div id={id} className="flex flex-col gap-5 px-3.5 pb-4 pt-1">{children}</div>}
    </div>
  )
}
