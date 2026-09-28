import type { SupabaseClient } from '@supabase/supabase-js'
import { toRpcFiltros, type Consulta, type ColunaConsulta } from './consulta'
import type { ValorCelula } from './tipos'

export interface LinhaConsultada {
  id: string
  dados: Record<string, ValorCelula>
  cliente_id: string | null
  ordem: number
}

// Argumentos da função SQL consultar_planilha_linhas (migration 049).
export function parametrosRpc(
  planilhaId: string,
  c: Consulta,
  colunas: ColunaConsulta[],
  offset: number,
  limit: number,
) {
  const colOrdem = c.ordem ? colunas.find(col => col.id === c.ordem) : undefined
  return {
    p_planilha: planilhaId,
    p_busca: c.q === '' ? null : c.q,
    p_filtros: toRpcFiltros(c, colunas),
    p_sem_cliente: c.semCliente,
    p_ordem_coluna: colOrdem ? colOrdem.id : null,
    p_ordem_tipo: colOrdem ? colOrdem.tipo : null,
    p_ordem_desc: c.desc,
    p_offset: Math.max(0, Math.floor(offset)),
    p_limit: Math.min(1000, Math.max(0, Math.floor(limit))),
  }
}

// `total` = linhas que casam com a consulta (vem repetido em cada linha da
// resposta). Com offset 0 e limit 1 a chamada serve só para descobrir o total.
export async function consultarLinhas(
  supabase: SupabaseClient,
  planilhaId: string,
  c: Consulta,
  colunas: ColunaConsulta[],
  offset: number,
  limit: number,
): Promise<{ linhas: LinhaConsultada[]; total: number; error: string | null }> {
  const { data, error } = await supabase.rpc('consultar_planilha_linhas', parametrosRpc(planilhaId, c, colunas, offset, limit))
  if (error) return { linhas: [], total: 0, error: error.message }
  const rows = (data ?? []) as (LinhaConsultada & { total: number | string })[]
  return {
    linhas: rows.map(r => ({ id: r.id, dados: r.dados, cliente_id: r.cliente_id, ordem: r.ordem })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    error: null,
  }
}
