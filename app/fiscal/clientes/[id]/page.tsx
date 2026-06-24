import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import TarefaChecklist from '@/components/fiscal/TarefaChecklist'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()

  const { data: tarefas } = await supabase
    .from('tarefas')
    .select('*')
    .eq('cliente_id', id)
    .eq('mes', mes)
    .eq('ano', ano)

  async function toggleTarefa(tipo: string, concluida: boolean) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('tarefas').upsert({
      cliente_id: id,
      usuario_id: user.id,
      mes,
      ano,
      tipo,
      concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
    }, { onConflict: 'cliente_id,mes,ano,tipo' })

    revalidatePath(`/fiscal/clientes/${id}`)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 pb-6 border-b border-white/8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
            <span className="text-white/30 text-xs font-mono">{cliente.cod ?? '—'}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{cliente.nome}</h1>
            <p className="text-white/40 text-sm mt-1">{cliente.cnpj ?? '—'}</p>
            <div className="flex gap-3 mt-2 flex-wrap">
              {cliente.regime && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.regime}</span>
              )}
              {cliente.atividade && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>
              )}
              {cliente.responsavel && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>
              )}
            </div>
            {cliente.obs && (
              <p className="text-yellow-400/70 text-xs mt-2">⚠ {cliente.obs}</p>
            )}
          </div>
        </div>
      </div>

      <TarefaChecklist
        clienteId={id}
        grupo={cliente.grupo ?? 'normal'}
        tarefas={tarefas ?? []}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        onToggle={toggleTarefa}
      />
    </div>
  )
}
