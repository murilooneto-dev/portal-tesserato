'use client'

import { useRouter } from 'next/navigation'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Input'

interface Props {
  usuarios: { id: string; nome: string }[]
  selecionado?: string
}

export default function MinhasTarefasSeletorUsuario({ usuarios, selecionado }: Props) {
  const router = useRouter()

  return (
    <Field rotulo="Usuário" className="w-full sm:w-[300px]">
      {c => (
        <Select
          id={c.id}
          value={selecionado ?? ''}
          onChange={e => router.push(e.target.value ? `/fiscal/minhas-tarefas?usuario=${e.target.value}` : '/fiscal/minhas-tarefas')}
        >
          <option value="">Selecione um usuário</option>
          {usuarios.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </Select>
      )}
    </Field>
  )
}
