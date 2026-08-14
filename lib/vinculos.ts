// lib/vinculos.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { SETOR_LABEL, type UserSetor } from './types'
import type { TarefaVinculo } from './types'
import { buscarTodasTarefasDoMes } from './tarefas-paginacao'

export interface VinculoStatus {
  setorOrigemLabel: string
  liberada: boolean
  concluidos: number
  total: number
}

export function agregarStatusVinculo(
  origens: { setorOrigemLabel: string; concluida: boolean }[],
): VinculoStatus {
  const total = origens.length
  const concluidos = origens.filter(o => o.concluida).length
  return {
    setorOrigemLabel: origens[0]?.setorOrigemLabel ?? '',
    liberada: total > 0 && concluidos === total,
    concluidos,
    total,
  }
}

export function formatarBadgeVinculo(
  status: { liberada: boolean; concluidos: number; total: number; setorOrigemLabel: string },
): { texto: string; classe: string } {
  const classe = status.liberada
    ? 'bg-green-500/15 text-green-400'
    : 'bg-orange-500/15 text-orange-400'
  if (status.total <= 1) {
    return {
      classe,
      texto: status.liberada
        ? `✓ Liberada por ${status.setorOrigemLabel}`
        : `⏳ Aguardando ${status.setorOrigemLabel}`,
    }
  }
  return {
    classe,
    texto: status.liberada
      ? `✓ Liberada (${status.concluidos}/${status.total})`
      : `⏳ Aguardando (${status.concluidos}/${status.total} concluídas)`,
  }
}

export function calcularNovosPares(
  setorOrigem: UserSetor,
  tiposOrigem: string[],
  setorDestino: UserSetor,
  tiposDestino: string[],
  vinculosExistentes: TarefaVinculo[],
): { tipoOrigem: string; tipoDestino: string }[] {
  const existentesSet = new Set(
    vinculosExistentes
      .filter(v => v.setor_origem === setorOrigem && v.setor_destino === setorDestino)
      .map(v => `${v.tipo_origem}||${v.tipo_destino}`),
  )
  const pares: { tipoOrigem: string; tipoDestino: string }[] = []
  for (const o of tiposOrigem) {
    for (const d of tiposDestino) {
      const key = `${o}||${d}`
      if (!existentesSet.has(key)) pares.push({ tipoOrigem: o, tipoDestino: d })
    }
  }
  return pares
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

export interface PendenciaVinculo {
  tipoDestino: string
  tipoOrigem: string
  setorOrigemLabel: string
  liberada: boolean
}

// Pra todos os clientes de uma listagem de uma vez (evita N+1 query):
// calcula, pra cada vínculo ativo do cliente cujo setor de destino é
// `setorAtual`, se a tarefa de destino (mesmo cliente, mesmo mês/ano)
// ainda NÃO está concluída — e nesse caso, se a tarefa de origem já
// está concluída (liberada) ou não (aguardando). Vínculos cuja tarefa
// de destino já está concluída não entram no resultado.
export async function buscarPendenciasVinculoPorCliente(
  supabase: SupabaseClient,
  clientes: { id: string; tarefas_vinculadas_ativas: string[] }[],
  tarefasDestinoDoMes: { cliente_id: string; tipo: string; concluida: boolean }[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, PendenciaVinculo[]>> {
  const idsVinculosAtivos = Array.from(new Set(clientes.flatMap(c => c.tarefas_vinculadas_ativas)))
  if (idsVinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', idsVinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const setoresOrigem = Array.from(new Set(vinculos.map(v => v.setor_origem as UserSetor)))
  const origemConcluidaPorSetor: Record<string, Record<string, boolean>> = {}
  for (const setorOrigem of setoresOrigem) {
    const tarefasOrigem = await buscarTodasTarefasDoMes<{ cliente_id: string; tipo: string; concluida: boolean }>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', setorOrigem
    )
    const mapa: Record<string, boolean> = {}
    for (const t of tarefasOrigem) mapa[`${t.cliente_id}||${t.tipo}`] = t.concluida
    origemConcluidaPorSetor[setorOrigem] = mapa
  }

  const destinoConcluida: Record<string, boolean> = {}
  for (const t of tarefasDestinoDoMes) destinoConcluida[`${t.cliente_id}||${t.tipo}`] = t.concluida

  const resultado: Record<string, PendenciaVinculo[]> = {}
  for (const c of clientes) {
    const vinculosDoCliente = vinculos.filter(v => c.tarefas_vinculadas_ativas.includes(v.id as string))
    for (const v of vinculosDoCliente) {
      const origemFeita = !!origemConcluidaPorSetor[v.setor_origem as string]?.[`${c.id}||${v.tipo_origem}`]
      const destinoFeita = !!destinoConcluida[`${c.id}||${v.tipo_destino}`]
      if (!destinoFeita) {
        if (!resultado[c.id]) resultado[c.id] = []
        resultado[c.id].push({
          tipoDestino: v.tipo_destino as string,
          tipoOrigem: v.tipo_origem as string,
          setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor],
          liberada: origemFeita,
        })
      }
    }
  }
  return resultado
}
