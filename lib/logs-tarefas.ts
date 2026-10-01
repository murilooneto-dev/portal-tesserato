// Parte pura do log de estrutura de tarefas (tipo_evento 'tarefas' em
// evento_log) — sem Supabase, pra poder ser usada tanto no servidor (montar
// o diff) quanto na tela de logs (descrever o evento) e testada isolada.

export type AcaoTarefas = 'cliente' | 'grupo_criado' | 'grupo_editado' | 'grupo_excluido'

export interface DetalhesTarefas {
  acao: AcaoTarefas
  adicionadas?: string[]
  removidas?: string[]
  grupo?: string
  grupo_antigo?: string
  tarefas?: string[]
}

// Compara a lista de tarefas que o cliente tinha com a que passou a ter
// (já somando configuradas por atividade/regime + personalizadas, ver
// calcularTarefasEsperadas). Ordem não importa; duplicados são ignorados.
export function diffTarefas(antes: string[] | null | undefined, depois: string[] | null | undefined) {
  const a = new Set(antes ?? [])
  const d = new Set(depois ?? [])
  return {
    adicionadas: Array.from(d).filter(t => !a.has(t)).sort((x, y) => x.localeCompare(y)),
    removidas: Array.from(a).filter(t => !d.has(t)).sort((x, y) => x.localeCompare(y)),
  }
}

export function descreverEventoTarefas(detalhes: DetalhesTarefas | null | undefined): string {
  if (!detalhes) return '—'
  const lista = (xs?: string[]) => (xs && xs.length ? xs.join(', ') : '—')
  switch (detalhes.acao) {
    case 'cliente': {
      const partes: string[] = []
      if (detalhes.adicionadas?.length) partes.push(`Adicionadas: ${lista(detalhes.adicionadas)}`)
      if (detalhes.removidas?.length) partes.push(`Removidas: ${lista(detalhes.removidas)}`)
      return partes.length ? partes.join(' · ') : '—'
    }
    case 'grupo_criado':
      return `Grupo criado: ${detalhes.grupo ?? '—'} (${lista(detalhes.tarefas)})`
    case 'grupo_editado': {
      const nome = detalhes.grupo_antigo && detalhes.grupo_antigo !== detalhes.grupo
        ? `${detalhes.grupo_antigo} → ${detalhes.grupo}`
        : detalhes.grupo ?? '—'
      return `Grupo editado: ${nome} (${lista(detalhes.tarefas)})`
    }
    case 'grupo_excluido':
      return `Grupo excluído: ${detalhes.grupo ?? '—'}`
    default:
      return '—'
  }
}
