import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import type { Tarefa } from '@/lib/types'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { mes, ano } = await getMesAno()

  const catalogo = await buscarCatalogoCliente(supabase, 'fiscal')

  const clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')
  const tarefaTiposQ = supabase.from('tarefa_tipos').select('nome, responsavel_id').eq('setor', 'fiscal')

  const [{ data: clientesRaw }, tarefas, { data: tarefaTiposRaw }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    tarefaTiposQ,
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)

  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')

  const responsavelIdPorTipo = new Map(
    (tarefaTiposRaw ?? []).map(t => [t.nome as string, t.responsavel_id as string | null])
  )

  // Mapa de tipos por cliente — só os visíveis pro usuário logado, senão
  // uma tarefa de responsável exclusivo alheio infla a % e a pendência de
  // quem não deveria nem ver essa tarefa (ver app/fiscal/tarefas/page.tsx
  // e app/fiscal/clientes/[id]/page.tsx, que já fazem esse filtro).
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const tipos = calcularTarefasEsperadas(c, mapaVinculos)
      .filter(tipo => tipoVisivelParaUsuario(responsavelIdPorTipo.get(tipo), user.id, profile?.role))
    tiposMap[c.id] = new Set(tipos)
  }

  // Progresso por cliente
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [id, tipos] of Object.entries(tiposMap)) {
    progressoMap[id] = { total: tipos.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
  )

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas ?? [],
    'fiscal',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
