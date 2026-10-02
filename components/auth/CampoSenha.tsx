'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'

// Campo de senha com botão de mostrar/ocultar; 44 px de altura (telas de acesso).
export function CampoSenha({ invalido, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalido?: boolean }) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <div className="relative min-w-0">
      <Input type={mostrar ? 'text' : 'password'} invalido={invalido} className={cn('h-11 pr-12', className)} {...rest} />
      <IconButton
        rotulo={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        icone={mostrar ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        onClick={() => setMostrar(v => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
      />
    </div>
  )
}
