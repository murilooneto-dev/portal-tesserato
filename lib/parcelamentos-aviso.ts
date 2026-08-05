// lib/parcelamentos-aviso.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type StatusParcelamento = 'EM ANDAMENTO' | 'LIQUIDADO' | 'CANCELADO'

// Labels curtos pra não mostrar o nome completo da seção no aviso da ficha
// (ex: "RECEITA FEDERAL - ECAC" → "Ecac"). Lista fixa espelhando as seções
// de app/fiscal/parcelamentos/page.tsx (SECOES).
export const SECAO_LABEL_CURTO: Record<string, string> = {
  'RECEITA FEDERAL - ECAC': 'Ecac',
  'PGFN - ECAC': 'PGFN',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA': 'Sefaz (Multa)',
  'SEFAZ - PARCELAMENTOS': 'Sefaz',
  'FGTS DIGITAL': 'FGTS',
}

// Busca as seções distintas de parcelamento em andamento pro CNPJ do
// cliente, já traduzidas pro label curto. Retorna [] se o cliente não tem
// CNPJ cadastrado ou não tem parcelamento ativo — nunca lança erro.
export async function buscarLabelsParcelamentoAtivo(
  supabase: SupabaseClient,
  cnpj: string | null,
): Promise<string[]> {
  if (!cnpj) return []

  const { data } = await supabase
    .from('parcelamentos')
    .select('secao')
    .eq('cnpj', cnpj)
    .eq('status', 'EM ANDAMENTO')
    .order('secao')

  if (!data || data.length === 0) return []

  const secoesUnicas = Array.from(new Set(data.map(p => p.secao as string)))
  return secoesUnicas.map(s => SECAO_LABEL_CURTO[s] ?? s)
}
