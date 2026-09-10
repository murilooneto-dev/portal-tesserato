import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientesListaSocietario from '@/components/societario/ClientesListaSocietario'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { tarefaEsperadaNoPeriodo } from '@/lib/tarefas-societario-periodicidade'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Societário' }

export default async function ClientesSocietarioPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { mes, ano } = await getMesAno()

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('id, nome, cnpj, municipio, uf, tarefas_vinculadas_ativas')
    .contains('setores', ['societario'])
    .order('nome')

  const clientes = clientesRaw ?? []
  const clienteIds = clientes.map(c => c.id)

  // Vínculos cliente → tipo de tarefa (entidade_tipo='cliente'), a mesma
  // regra de app/societario/clientes/tarefas-actions.ts:22-45
  // (listarTarefasSocietarioDoCliente), só que em lote pra todos os
  // clientes da listagem em vez de um único.
  const [{ data: vinculosRaw }, { data: tarefaTiposRaw }, tarefas] = await Promise.all([
    clienteIds.length > 0
      ? supabase
        .from('tarefa_tipo_vinculos')
        .select('entidade_id, created_at, tarefa_tipos!inner(nome, ativo, setor, meses_visiveis)')
        .eq('entidade_tipo', 'cliente')
        .in('entidade_id', clienteIds)
        .eq('tarefa_tipos.setor', 'societario')
      : Promise.resolve({ data: [] as never[] }),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'societario').eq('ativo', true).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(
      supabase, mes, ano, 'cliente_id, concluida, tipo', 'societario',
    ),
  ])

  type TipoJoin = { nome: string; ativo: boolean; meses_visiveis: number[] | null }

  const tarefasDisponiveis = (tarefaTiposRaw ?? []).map(t => t.nome as string)

  const tiposPorCliente: Record<string, string[]> = {}
  for (const id of clienteIds) tiposPorCliente[id] = []
  for (const v of vinculosRaw ?? []) {
    const tipo = v.tarefa_tipos as unknown as TipoJoin
    if (!tipo.ativo) continue
    if (!tarefaEsperadaNoPeriodo({ mesesVisiveis: tipo.meses_visiveis, vinculoCreatedAt: v.created_at as string }, mes, ano)) continue
    tiposPorCliente[v.entidade_id as string]?.push(tipo.nome)
  }

  const concluidasPorCliente: Record<string, string[]> = {}
  for (const id of clienteIds) concluidasPorCliente[id] = []
  for (const t of tarefas) {
    if (t.concluida && tiposPorCliente[t.cliente_id]?.includes(t.tipo)) {
      concluidasPorCliente[t.cliente_id].push(t.tipo)
    }
  }

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas ?? [] })),
    tarefas,
    'societario',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaSocietario
        clientes={clientes}
        tiposPorCliente={tiposPorCliente}
        concluidasPorCliente={concluidasPorCliente}
        tarefasDisponiveis={tarefasDisponiveis}
        mes={mes}
        ano={ano}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
