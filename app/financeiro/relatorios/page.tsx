import { createClient } from '@/lib/supabase/server'
import { buscarEmBlocos } from '@/lib/financeiro-movimentos'
import RelatoriosFinanceiroClient, { type MovimentoRelatorio } from './RelatoriosFinanceiroClient'

export const metadata = { title: 'Relatórios — Tesserato Financeiro' }

interface Props {
  searchParams: Promise<{ natureza?: string; tipoId?: string; centroCustoId?: string; de?: string; ate?: string }>
}

interface LinhaBanco {
  id: string; natureza: 'entrada' | 'saida'; valor: number; data: string; observacao: string | null
  financeiro_tipos: { nome: string } | null
  financeiro_centros_custo: { nome: string } | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export default async function RelatoriosFinanceiroPage({ searchParams }: Props) {
  // Filtro malformado na URL (editada à mão) é ignorado em vez de virar erro do banco.
  const bruto = await searchParams
  const natureza = bruto.natureza === 'entrada' || bruto.natureza === 'saida' ? bruto.natureza : undefined
  const tipoId = bruto.tipoId && UUID.test(bruto.tipoId) ? bruto.tipoId : undefined
  const centroCustoId = bruto.centroCustoId && UUID.test(bruto.centroCustoId) ? bruto.centroCustoId : undefined
  const de = bruto.de && DATA_ISO.test(bruto.de) ? bruto.de : undefined
  const ate = bruto.ate && DATA_ISO.test(bruto.ate) ? bruto.ate : undefined
  const supabase = await createClient()

  // Todos os lançamentos do filtro, em blocos de 1000: os totais de entradas,
  // saídas e saldo valem para o período inteiro (antes parava em 1000 sem aviso).
  const linhas = await buscarEmBlocos<LinhaBanco>((inicio, fim) => {
    let query = supabase
      .from('financeiro_movimentos')
      .select('id, natureza, valor, data, observacao, financeiro_tipos(nome), financeiro_centros_custo(nome)')
      .order('data', { ascending: false })
      .order('id', { ascending: true })

    if (natureza) query = query.eq('natureza', natureza)
    if (tipoId) query = query.eq('tipo_id', tipoId)
    if (centroCustoId) query = query.eq('centro_custo_id', centroCustoId)
    if (de) query = query.gte('data', de)
    if (ate) query = query.lte('data', ate)

    return query.range(inicio, fim).overrideTypes<LinhaBanco[], { merge: false }>()
  })

  const movimentos: MovimentoRelatorio[] = linhas.map(r => ({
    id: r.id,
    natureza: r.natureza,
    valor: r.valor,
    data: r.data,
    observacao: r.observacao,
    tipo_nome: r.financeiro_tipos?.nome ?? '—',
    centro_custo_nome: r.financeiro_centros_custo?.nome ?? null,
  }))

  const [{ data: tiposEntrada }, { data: tiposSaida }, { data: centrosCusto }] = await Promise.all([
    supabase.from('financeiro_tipos').select('id, nome').eq('natureza', 'entrada').order('nome'),
    supabase.from('financeiro_tipos').select('id, nome').eq('natureza', 'saida').order('nome'),
    supabase.from('financeiro_centros_custo').select('id, nome').order('nome'),
  ])

  return (
    <RelatoriosFinanceiroClient
      movimentos={movimentos}
      tiposEntrada={tiposEntrada ?? []}
      tiposSaida={tiposSaida ?? []}
      centrosCusto={centrosCusto ?? []}
      filtros={{ natureza: natureza ?? '', tipoId: tipoId ?? '', centroCustoId: centroCustoId ?? '', de: de ?? '', ate: ate ?? '' }}
    />
  )
}
