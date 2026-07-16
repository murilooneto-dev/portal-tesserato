// lib/vinculos.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { SETOR_LABEL, type UserSetor } from './types'

export interface VinculoStatus {
  setorOrigemLabel: string
  liberada: boolean
}

// Pra cada vínculo ativo do cliente cujo setor de destino é `setorAtual`,
// verifica se a tarefa de origem (mesmo cliente, mesmo mês/ano) está
// concluída. Retorna um mapa por tipo_destino — usado pelas checklists
// pra decidir se mostram o selo "Aguardando" ou "Liberada".
export async function buscarVinculosDoCliente(
  supabase: SupabaseClient,
  clienteId: string,
  vinculosAtivos: string[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, VinculoStatus>> {
  if (vinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', vinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const resultado: Record<string, VinculoStatus> = {}
  for (const v of vinculos) {
    const { data: origem } = await supabase
      .from('tarefas')
      .select('concluida')
      .eq('cliente_id', clienteId)
      .eq('setor', v.setor_origem)
      .eq('tipo', v.tipo_origem)
      .eq('mes', mes)
      .eq('ano', ano)
      .maybeSingle()

    resultado[v.tipo_destino as string] = {
      setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor],
      liberada: !!origem?.concluida,
    }
  }
  return resultado
}
