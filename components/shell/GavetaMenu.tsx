'use client'

import Image from 'next/image'
import { LogOut, Moon, Sun } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'
import type { GrupoMenu } from '@/lib/navegacao'
import { MenuLateral } from './MenuLateral'

export function GavetaMenu({ aberto, onFechar, profile, grupos, pathname, setores, setorAtivo, tema, onTrocarSetor, onAlternarTema, onSair }: {
  aberto: boolean
  onFechar: () => void
  profile: Profile
  grupos: GrupoMenu[]
  pathname: string
  setores: UserSetor[]
  setorAtivo: UserSetor
  tema: 'dark' | 'light'
  onTrocarSetor: (s: UserSetor) => void
  onAlternarTema: () => void
  onSair: () => void
}) {
  const nome = profile.nome ?? 'Usuário'
  return (
    <Drawer
      aberto={aberto}
      onFechar={onFechar}
      titulo={
        <span className="flex items-center gap-2.5 font-bold tracking-[.01em]">
          <Image src="/logo.ico" alt="" width={28} height={28} className="rounded-lg" />
          Tesserato
        </span>
      }
      lado="esquerda"
      larguraPx={316}
      fecharGrande
      rodape={
        <div className="flex w-full items-center gap-2.5">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: profile.cor }}>
            {nome.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold text-fg">{nome}</p>
            <p className="text-xs text-fg-3">{profile.role === 'admin' ? 'Administrador' : 'Operador'}</p>
          </div>
          <IconButton
            rotulo={tema === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
            icone={tema === 'light' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
            onClick={onAlternarTema}
            className="h-11 w-11"
          />
          <IconButton rotulo="Sair" icone={<LogOut size={20} aria-hidden="true" />} onClick={onSair} className="h-11 w-11" />
        </div>
      }
    >
      {setores.length > 1 && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-fg-2">
          Setor
          <Select aria-label="Setor" value={setorAtivo} onChange={e => onTrocarSetor(e.target.value as UserSetor)} className="h-11">
            {setores.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
          </Select>
        </label>
      )}
      <MenuLateral grupos={grupos} pathname={pathname} toque onNavegar={onFechar} className="-mx-3 px-0 py-0" />
    </Drawer>
  )
}
