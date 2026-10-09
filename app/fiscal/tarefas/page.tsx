import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MonthPill } from '@/components/ui/MonthPill'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { tipoVisivelParaUsuario, tipoContaNoProgressoDoCliente, donoAtendeRegime } from '@/lib/tarefa-tipo-visibilidade'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
import { buscarDonoNomePorTipoFiscal } from '@/lib/tarefa-tipo-donos-actions'
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

  const { data: tarefaTiposRaw } = await supabase
    .from('tarefa_tipos').select('nome, responsavel_id').eq('setor', 'fiscal')
  const responsavelIdPorTipo = new Map(
    (tarefaTiposRaw ?? []).map(t => [t.nome as string, t.responsavel_id as string | null])
  )
  // Tarefa de tipo com responsável exclusivo não conta na % de quem não é
  // o dono nem admin — ver lib/supabase/server.ts:podeEditarTarefaTipo.
  const [donoNomePorTipo, regimesPorTipo] = await Promise.all([
    buscarDonoNomePorTipoFiscal(),
    buscarRegimesPorTipo(supabase, 'fiscal'),
  ])
  // Dono só vale nos clientes dos regimes que ele marcou (Minhas Tarefas).
  const donoVale = (tipo: string, regime: string | null) => donoAtendeRegime(regimesPorTipo[tipo], regime)
  const tipoVisivel = (tipo: string, regime: string | null) =>
    tipoVisivelParaUsuario(donoVale(tipo, regime) ? responsavelIdPorTipo.get(tipo) : null, user.id, profile?.role)

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(cod, responsavel, regime)')
    .eq('clientes_fiscal.ativo', true)
    .order('nome')

  const clientesFlat = (clientes ?? []).map(row => {
    const c = row as unknown as {
      id: string
      nome: string
      clientes_fiscal: { cod: string | null; responsavel: string | null; regime: string | null }
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

  const linhas = clientesFiltrados.map(cliente => {
    const ts = (tarefasPorCliente.get(cliente.id) ?? []).filter(t =>
      tipoVisivel(t.tipo, cliente.regime)
      && tipoContaNoProgressoDoCliente(donoVale(t.tipo, cliente.regime) ? donoNomePorTipo[t.tipo] : null, cliente.responsavel))
    const concluidas = ts.filter(t => t.concluida).length
    const total = ts.length
    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
    return { cliente, concluidas, total, pct }
  })

  return (
    <Pagina className="mx-auto w-full max-w-6xl">
      <CabecalhoPagina titulo="Tarefas" subtitulo={`Visão geral — ${MESES[mes - 1]}/${ano}`} />

      <Card semPadding className="overflow-hidden">
        {linhas.length === 0 ? (
          <EmptyState icone={<ClipboardList size={24} />} titulo="Nenhum cliente ativo no Fiscal" descricao="As tarefas do mês aparecem aqui assim que houver clientes ativos no setor." />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th largura={160}>Responsável</Th>
                  <Th largura={150}>Progresso do mês</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ cliente, concluidas, total, pct }) => (
                  <tr key={cliente.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                    <Td>
                      <Link href={`/fiscal/clientes/${cliente.id}`} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                        <NomeCliente nome={cliente.nome} />
                      </Link>
                    </Td>
                    <Td className="text-fg-2">{cliente.responsavel ? <span className="block truncate" title={cliente.responsavel}>{cliente.responsavel}</span> : <span className="text-fg-3">—</span>}</Td>
                    <Td>
                      {total > 0 ? (
                        <div className="flex items-center gap-2">
                          <MonthPill percentual={pct} />
                          <span className="text-[13px] text-fg-3">{concluidas}/{total}</span>
                        </div>
                      ) : <span className="text-fg-3">—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </Pagina>
  )
}
