import { createClient } from '@/lib/supabase/server'
import { buscarEmBlocos, intervaloDoMes } from '@/lib/financeiro-movimentos'
import { hojeISO } from '@/lib/mes-atual'
import { getMesAno } from '@/lib/mes-atual-server'
import ContasAPagarClient, { type ContaLinha } from '@/components/financeiro/ContasAPagarClient'

export const metadata = { title: 'Contas a pagar — Tesserato Financeiro' }

interface LinhaBanco {
  id: string; tipo_id: string; centro_custo_id: string | null; valor: number; data: string; observacao: string | null; created_at: string; recorrencia_id: string | null; competencia: string | null; pago: boolean
  financeiro_tipos: { nome: string } | null
  financeiro_centros_custo: { nome: string } | null
}

export default async function ContasAPagarPage() {
  const supabase = await createClient()

  // As contas em aberto que vencem até o fim do mês do seletor: pega o mês e
  // também as vencidas de antes, que continuam a pagar.
  const { mes, ano } = await getMesAno()
  const { fim: ultimoDia } = intervaloDoMes(mes, ano)

  const linhas = await buscarEmBlocos<LinhaBanco>((inicio, fim) => supabase
    .from('financeiro_movimentos')
    .select('id, tipo_id, centro_custo_id, valor, data, observacao, created_at, recorrencia_id, competencia, pago, financeiro_tipos(nome), financeiro_centros_custo(nome)')
    .eq('natureza', 'saida')
    .eq('pago', false)
    .lte('data', ultimoDia)
    .order('data', { ascending: true })
    .order('id', { ascending: true })
    .range(inicio, fim)
    .overrideTypes<LinhaBanco[], { merge: false }>())

  const contas: ContaLinha[] = linhas.map(r => ({
    id: r.id,
    tipo_id: r.tipo_id,
    centro_custo_id: r.centro_custo_id,
    valor: r.valor,
    data: r.data,
    observacao: r.observacao,
    created_at: r.created_at,
    recorrencia_id: r.recorrencia_id,
    competencia: r.competencia,
    pago: r.pago,
    tipo_nome: r.financeiro_tipos?.nome ?? '—',
    centro_custo_nome: r.financeiro_centros_custo?.nome ?? null,
  }))

  return <ContasAPagarClient contas={contas} mes={mes} ano={ano} hoje={hojeISO()} />
}
