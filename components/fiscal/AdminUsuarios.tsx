import type { Profile } from '@/lib/types'
import { SETOR_LABEL } from '@/lib/types'

interface Props {
  profiles: Profile[]
}

const COR_ROLE: Record<string, string> = {
  admin:    '#6366f1',
  operador: '#10b981',
}

export default function AdminUsuarios({ profiles }: Props) {
  return (
    <div>
      <div className="flex flex-col gap-3">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/6">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--fg)] font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: p.cor }}
            >
              {p.nome.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-[var(--fg)] font-medium text-sm">{p.nome}</p>
              <p className="text-[var(--fg)]/30 text-xs capitalize mt-0.5">{p.setores.map(s => SETOR_LABEL[s]).join(', ')}</p>
            </div>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium capitalize"
              style={{
                backgroundColor: (COR_ROLE[p.role] ?? '#6b7280') + '20',
                color: COR_ROLE[p.role] ?? '#6b7280',
                border: `1px solid ${(COR_ROLE[p.role] ?? '#6b7280')}40`,
              }}
            >
              {p.role}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[var(--fg)]/20 text-xs mt-6">
        Para adicionar ou remover usuários, acesse o painel do Supabase em Authentication → Users.
      </p>
    </div>
  )
}
