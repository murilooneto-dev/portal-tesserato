import { createClient } from '@/lib/supabase/server'
import { buscarEmBlocos, intervaloDoMes } from '@/lib/financeiro-movimentos'
import { getMesAno } from '@/lib/mes-atual-server'
import MovimentoListClient, { type MovimentoLinha } from '@/components/financeiro/MovimentoListClient'

export const metadata = { title: 'Recebimentos — Tesserato Financeiro' }

interface LinhaBanco {
  id: string; tipo_id: string; centro_custo_id: string | null; valor: number; data: string; observacao: string | null; created_at: string
  financeiro_tipos: { nome: string } | null
  financeiro_centros_custo: { nome: string } | null
}

export default async function RecebimentosPage() {
  const supabase = await createClient()

  // Só o mês escolhido no seletor do portal (por padrão, o mês atual): um
  // lançamento com data em novembro não aparece na lista de outubro.
  const { mes, ano } = await getMesAno()
  const { inicio: primeiroDia, fim: ultimoDia } = intervaloDoMes(mes, ano)

  // Todos os lançamentos do mês, em blocos de 1000: a busca, a ordenação e o
  // total da tela valem para o mês inteiro (antes parava em 200 sem aviso).
  const linhas = await buscarEmBlocos<LinhaBanco>((inicio, fim) => supabase
    .from('financeiro_movimentos')
    .select('id, tipo_id, centro_custo_id, valor, data, observacao, created_at, financeiro_tipos(nome), financeiro_centros_custo(nome)')
    .eq('natureza', 'entrada')
    .gte('data', primeiroDia)
    .lte('data', ultimoDia)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(inicio, fim)
    .overrideTypes<LinhaBanco[], { merge: false }>())

  const movimentos: MovimentoLinha[] = linhas.map(r => ({
    id: r.id,
    tipo_id: r.tipo_id,
    centro_custo_id: r.centro_custo_id,
    valor: r.valor,
    data: r.data,
    observacao: r.observacao,
    created_at: r.created_at,
    tipo_nome: r.financeiro_tipos?.nome ?? '—',
    centro_custo_nome: r.financeiro_centros_custo?.nome ?? null,
  }))

  return <MovimentoListClient natureza="entrada" movimentos={movimentos} mes={mes} ano={ano} />
}