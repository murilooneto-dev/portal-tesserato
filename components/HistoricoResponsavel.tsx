import { createClient } from '@/lib/supabase/server'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
}

function formatData(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

export default async function HistoricoResponsavel({ clienteId, setor }: Props) {
  const supabase = await createClient()
  const { data: periodos } = await supabase
    .from('cliente_responsavel_historico')
    .select('responsavel, data_inicio, data_fim')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .order('data_inicio', { ascending: true })

  if (!periodos || periodos.length === 0) return null

  return (
    <div className="mt-10 pt-6 border-t border-[var(--fg)]/8">
      <h3 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">
        Histórico de responsável
      </h3>
      <ul className="space-y-1.5">
        {periodos.map((p, i) => (
          <li key={i} className="text-sm text-[var(--fg)]/60">
            De <span className="text-[var(--fg)]/80">{formatData(p.data_inicio)}</span> até{' '}
            <span className="text-[var(--fg)]/80">{p.data_fim ? formatData(p.data_fim) : 'agora'}</span> —{' '}
            <span className="font-semibold text-[var(--fg)]">{p.responsavel}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
