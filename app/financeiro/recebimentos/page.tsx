import { createClient } from '@/lib/supabase/server'
import MovimentoListClient, { type MovimentoLinha } from '@/components/financeiro/MovimentoListClient'

export const metadata = { title: 'Recebimentos — Tesserato Financeiro' }

export default async function RecebimentosPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('financeiro_movimentos')
    .select('id, tipo_id, centro_custo_id, valor, data, observacao, created_at, financeiro_tipos(nome), financeiro_centros_custo(nome)')
    .eq('natureza', 'entrada')
    .order('created_at', { ascending: false })
    .limit(200)

  const movimentos: MovimentoLinha[] = (data ?? []).map(row => {
    const r = row as unknown as {
      id: string; tipo_id: string; centro_custo_id: string | null; valor: number; data: string; observacao: string | null; created_at: string
      financeiro_tipos: { nome: string } | null
      financeiro_centros_custo: { nome: string } | null
    }
    return {
      id: r.id,
      tipo_id: r.tipo_id,
      centro_custo_id: r.centro_custo_id,
      valor: r.valor,
      data: r.data,
      observacao: r.observacao,
      created_at: r.created_at,
      tipo_nome: r.financeiro_tipos?.nome ?? '—',
      centro_custo_nome: r.financeiro_centros_custo?.nome ?? null,
    }
  })

  return (
    <MovimentoListClient
      natureza="entrada"
      titulo="Recebimentos"
      botaoNovo="+ Novo recebimento"
      movimentos={movimentos}
    />
  )
}
