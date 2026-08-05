import type { SupabaseClient } from '@supabase/supabase-js'

// Fonte única do mapeamento seção → rótulo curto (RN03).
export const SECAO_PARA_LOCAL: Record<string, string> = {
  'RECEITA FEDERAL - ECAC': 'Ecac',
  'PGFN - ECAC': 'PGFN',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA': 'SEFAZ',
  'SEFAZ - PARCELAMENTOS': 'SEFAZ',
  'FGTS DIGITAL': 'FGTS Digital',
}

// Ordem canônica de exibição (RN04/RN05), estável e previsível.
export const ORDEM_LOCAIS = ['Ecac', 'PGFN', 'SEFAZ', 'FGTS Digital'] as const

export function locaisDoParcelamento(rows: { secao: string }[]): string[] {
  const distintos = new Set(rows.map(row => SECAO_PARA_LOCAL[row.secao] ?? row.secao))
  const canonicos = ORDEM_LOCAIS.filter(local => distintos.has(local))
  const outros = Array.from(distintos).filter(local => !(ORDEM_LOCAIS as readonly string[]).includes(local))
  return [...canonicos, ...outros]
}

export async function buscarLocaisParcelamentoDoCliente(
  supabase: SupabaseClient,
  cliente: { nome: string }
): Promise<string[]> {
  const { data } = await supabase
    .from('parcelamentos')
    .select('secao')
    .eq('empresa_avulsa', false)
    .eq('empresa', cliente.nome)

  return locaisDoParcelamento(data ?? [])
}
