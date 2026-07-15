import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Tarefas — Tesserato Fiscal' }

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default async function TarefasPage() {
  const supabase = await createClient()

  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, nome')
    .eq('id', user.id)
    .single()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(cod, grupo, responsavel)')
    .order('nome')

  const clientesFlat = (clientes ?? []).map(row => {
    const c = row as unknown as {
      id: string
      nome: string
      clientes_fiscal: { cod: string | null; grupo: string | null; responsavel: string | null }
    }
    return { id: c.id, nome: c.nome, ...c.clientes_fiscal }
  })

  const tarefas = await buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano)

  const tarefasPorCliente = new Map<string, typeof tarefas>()
  tarefas.forEach(t => {
    if (!tarefasPorCliente.has(t.cliente_id)) tarefasPorCliente.set(t.cliente_id, [])
    tarefasPorCliente.get(t.cliente_id)!.push(t)
  })

  const clientesFiltrados = profile?.role === 'admin'
    ? clientesFlat
    : clientesFlat.filter(c =>
        c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase()
      )

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Tarefas</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Visão geral — {MESES[mes - 1]}/{ano}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {clientesFiltrados.map(cliente => {
          const ts = tarefasPorCliente.get(cliente.id) ?? []
          const concluidas = ts.filter(t => t.concluida).length
          const total = ts.length
          const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0

          return (
            <Link
              key={cliente.id}
              href={`/fiscal/clientes/${cliente.id}`}
              className="flex items-center gap-4 p-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/6 hover:bg-[var(--fg)]/6 transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-medium truncate">{cliente.nome}</p>
                <p className="text-[var(--fg)]/30 text-xs mt-0.5">{cliente.responsavel ?? '—'}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-24 h-1.5 bg-[var(--fg)]/8 rounded-full">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--fg)]/40 w-12 text-right">
                  {total > 0 ? `${concluidas}/${total}` : '—'}
                </span>
              </div>
            </Link>
          )
        })}

        {clientesFiltrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  )
}
