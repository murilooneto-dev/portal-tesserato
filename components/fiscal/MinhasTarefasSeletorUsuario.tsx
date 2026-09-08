'use client'

import { useRouter } from 'next/navigation'

interface Props {
  usuarios: { id: string; nome: string }[]
  selecionado?: string
}

const selectCls = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function MinhasTarefasSeletorUsuario({ usuarios, selecionado }: Props) {
  const router = useRouter()

  return (
    <select
      value={selecionado ?? ''}
      onChange={e => router.push(e.target.value ? `/fiscal/minhas-tarefas?usuario=${e.target.value}` : '/fiscal/minhas-tarefas')}
      className={selectCls}
    >
      <option value="" className="bg-[var(--bg-surface)]">— Selecione um usuário —</option>
      {usuarios.map(u => (
        <option key={u.id} value={u.id} className="bg-[var(--bg-surface)]">{u.nome}</option>
      ))}
    </select>
  )
}
