import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, LogOut, Menu, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'

export function BarraTopo({ profile, setores, setorAtivo, tema, seletorMes, onTrocarSetor, onAlternarTema, onSair, onAbrirMenu, menuAberto, titulo = null, tituloGrupo = null, voltarHref = null }: {
  profile: Profile
  setores: UserSetor[]
  setorAtivo: UserSetor
  tema: 'dark' | 'light'
  seletorMes: ReactNode
  onTrocarSetor: (s: UserSetor) => void
  onAlternarTema: () => void
  onSair: () => void
  onAbrirMenu: () => void
  menuAberto: boolean
  /** Título da página atual, mostrado no lugar da marca abaixo de lg (nav-03/nav-07). */
  titulo?: string | null
  /** Grupo do menu (ex.: "Contábil"), antes do título no tablet. */
  tituloGrupo?: string | null
  /** Na ficha de cliente: seta de voltar para a lista do setor (celular). */
  voltarHref?: string | null
}) {
  const nome = profile.nome ?? 'Usuário'
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line-soft bg-top px-2 print:hidden sm:gap-3 lg:px-4">
      <IconButton rotulo="Abrir menu" icone={<Menu size={22} aria-hidden="true" />} onClick={onAbrirMenu} aria-haspopup="dialog" aria-expanded={menuAberto} className="h-11 w-11 lg:hidden" />
      {voltarHref && (
        <Link
          href={voltarHref}
          aria-label="Voltar para a lista de clientes"
          title="Voltar"
          className="inline-grid h-11 w-11 flex-none place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:hidden"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
      )}
      <div className={cn('flex shrink-0 items-center gap-2.5 font-bold tracking-[.01em] text-fg lg:w-[216px]', titulo && 'max-sm:hidden')}>
        <Image src="/logo.ico" alt="" width={28} height={28} className="rounded-lg" />
        <span className="hidden sm:inline">Tesserato</span>
      </div>
      {titulo && (
        <p className="min-w-0 flex-1 truncate text-[17px] font-semibold text-fg sm:border-l sm:border-line-soft sm:pl-3 sm:text-[15px] lg:hidden">
          {tituloGrupo && <span className="hidden text-fg-2 sm:inline">{tituloGrupo} · </span>}
          {titulo}
        </p>
      )}
      {setores.length > 1 && (
        <nav aria-label="Setores" className="hidden min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex">
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
      <div className={cn('flex-1', titulo && 'max-lg:hidden')} />
      {seletorMes}
      <IconButton
        rotulo={tema === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
        icone={tema === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        onClick={onAlternarTema}
        className="hidden sm:inline-grid"
      />
      <div className="hidden shrink-0 items-center gap-2.5 border-l border-line-soft pl-3.5 lg:flex">
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
