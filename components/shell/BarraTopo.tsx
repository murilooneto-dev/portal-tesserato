import Image from 'next/image'
import type { ReactNode } from 'react'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'

export function BarraTopo({ profile, setores, setorAtivo, tema, seletorMes, onTrocarSetor, onAlternarTema, onSair, onAbrirMenu }: {
  profile: Profile
  setores: UserSetor[]
  setorAtivo: UserSetor
  tema: 'dark' | 'light'
  seletorMes: ReactNode
  onTrocarSetor: (s: UserSetor) => void
  onAlternarTema: () => void
  onSair: () => void
  onAbrirMenu: () => void
}) {
  const nome = profile.nome ?? 'Usuário'
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line-soft bg-top px-2 print:hidden sm:gap-3 lg:px-4">
      <IconButton rotulo="Abrir menu" icone={<Menu size={22} aria-hidden="true" />} onClick={onAbrirMenu} className="h-11 w-11 lg:hidden" />
      <div className="flex shrink-0 items-center gap-2.5 font-bold tracking-[.01em] text-fg lg:w-[216px]">
        <Image src="/logo.ico" alt="" width={28} height={28} className="rounded-lg" />
        <span className="hidden sm:inline">Tesserato</span>
      </div>
      {setores.length > 1 && (
        <nav aria-label="Setores" className="hidden min-w-0 gap-1 overflow-x-auto lg:flex">
          {setores.map(s => {
            const atual = s === setorAtivo
            return (
              <button
                key={s}
                type="button"
                onClick={() => onTrocarSetor(s)}
                aria-current={atual ? 'page' : undefined}
                className={cn(
                  'inline-flex h-[34px] shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  atual ? 'bg-acc-soft text-fg shadow-[inset_0_-2px_0_var(--acc)]' : 'text-fg-2 hover:bg-raised hover:text-fg',
                )}
              >
                {SETOR_LABEL[s]}
              </button>
            )
          })}
        </nav>
      )}
      <div className="flex-1" />
      {seletorMes}
      <IconButton
        rotulo={tema === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
        icone={tema === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        onClick={onAlternarTema}
        className="hidden sm:inline-grid"
      />
      <div className="hidden items-center gap-2.5 border-l border-line-soft pl-3.5 lg:flex">
        <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: profile.cor }}>
          {nome.charAt(0).toUpperCase()}
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-fg">{nome}</p>
          <p className="text-xs text-fg-3">{profile.role === 'admin' ? 'Administrador' : 'Operador'}</p>
        </div>
        <IconButton rotulo="Sair" icone={<LogOut size={17} aria-hidden="true" />} onClick={onSair} />
      </div>
    </header>
  )
}
