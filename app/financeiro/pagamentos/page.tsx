import { createClient } from '@/lib/supabase/server'
import { buscarEmBlocos, intervaloDoMes } from '@/lib/financeiro-movimentos'
import { getMesAno } from '@/lib/mes-atual-server'
import MovimentoListClient, { type MovimentoLinha } from '@/components/financeiro/MovimentoListClient'

export const metadata = { title: 'Pagamentos — Tesserato Financeiro' }

interface LinhaBanco {
  id: string; tipo_id: string; centro_custo_id: string | null; valor: number; data: string; observacao: string | null; created_at: string; recorrencia_id: string | null; pago: boolean
  pago_em: string | null; pago_em_hora: string | null; competencia: string | null
  financeiro_tipos: { nome: string } | null
  financeiro_centros_custo: { nome: string } | null
}

export default async function PagamentosPage() {
  const supabase = await createClient()

  // Histórico do que foi pago: só o mês escolhido no seletor do portal (por
  // padrão, o mês atual), pelo dia em que o pagamento aconteceu (pago_em). Conta
  // ainda não paga fica em Contas a pagar, não aqui.
  const { mes, ano } = await getMesAno()
  const { inicio: primeiroDia, fim: ultimoDia } = intervaloDoMes(mes, ano)

  // Todos os pagamentos do mês, em blocos de 1000: a busca, a ordenação e o
  // total da tela valem para o mês inteiro.
  const linhas = await buscarEmBlocos<LinhaBanco>((inicio, fim) => supabase
    .from('financeiro_movimentos')
    .select('id, tipo_id, centro_custo_id, valor, data, observacao, created_at, recorrencia_id, pago, pago_em, pago_em_hora, competencia, financeiro_tipos(nome), financeiro_centros_custo(nome)')
    .eq('natureza', 'saida')
    .eq('pago', true)
    .gte('pago_em', primeiroDia)
    .lte('pago_em', ultimoDia)
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
    recorrencia_id: r.recorrencia_id,
    pago: r.pago,
    pago_em: r.pago_em,
    pago_em_hora: r.pago_em_hora,
    competencia: r.competencia,
    tipo_nome: r.financeiro_tipos?.nome ?? '—',
    centro_custo_nome: r.financeiro_centros_custo?.nome ?? null,
  }))

  return <MovimentoListClient natureza="saida" movimentos={movimentos} mes={mes} ano={ano} />
}