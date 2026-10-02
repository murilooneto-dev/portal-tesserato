import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  className?: string
}

function formatData(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

export default async function HistoricoResponsavel({ clienteId, setor, className }: Props) {
  const supabase = await createClient()
  const { data: periodos } = await supabase
    .from('cliente_responsavel_historico')
    .select('responsavel, data_inicio, data_fim')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .order('data_inicio', { ascending: true })

  if (!periodos || periodos.length === 0) return null

  return (
    <Card titulo="Histórico de responsável" className={className}>
      <ul className="flex flex-col gap-3">
        {[...periodos].reverse().map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-2 h-2 w-2 flex-none rounded-full ${p.data_fim ? 'bg-fg-3' : 'bg-acc'}`} />
            <div className="min-w-0">
              <b className="text-sm font-semibold text-fg">{p.responsavel}</b>
              <p className="text-[13px] text-fg-3">
                {p.data_fim ? `${formatData(p.data_inicio)} a ${formatData(p.data_fim)}` : `desde ${formatData(p.data_inicio)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
