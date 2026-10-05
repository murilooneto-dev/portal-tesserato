// lib/calendario-grade.ts — quais prazos caem em cada dia do mês mostrado (funções puras).
// `mes` de 1 a 12. As regras de data de cada evento vêm de lib/calendario.
import type { CalendarioEvento } from './types'
import { ultimoDiaDoMes } from './calendario'
import { chaveDia } from './agenda'

export type VariantePrazo = 'interna' | 'oficial'

export interface PrazoDoMes {
  chave: string // aaaa-mm-dd
  dia: number
  variante: VariantePrazo
  evento: CalendarioEvento
}

export const ROTULO_PRAZO: Record<VariantePrazo, string> = { interna: 'Prazo interno', oficial: 'Vencimento oficial' }

function diaNoMes(evento: CalendarioEvento, variante: VariantePrazo, ano: number, mes: number): number | null {
  if (evento.tipo_data === 'unica') {
    const data = variante === 'interna' ? evento.interna_data : evento.oficial_data
    if (!data) return null
    const [a, m, d] = data.split('-').map(Number)
    return a === ano && m === mes ? d : null
  }
  const dia = variante === 'interna' ? evento.interna_dia_mes : evento.oficial_dia_mes
  if (dia == null) return null
  // Dia 31 num mês de 30 dias cai no último dia, como em proximaOcorrencia.
  return Math.min(dia, ultimoDiaDoMes(ano, mes))
}

/** Todos os prazos (interno e oficial) que caem no mês, por dia e depois por título. */
export function prazosDoMes(eventos: CalendarioEvento[], ano: number, mes: number): PrazoDoMes[] {
  const lista: PrazoDoMes[] = []
  for (const evento of eventos) {
    for (const variante of ['interna', 'oficial'] as const) {
      const dia = diaNoMes(evento, variante, ano, mes)
      if (dia !== null) lista.push({ chave: chaveDia(ano, mes, dia), dia, variante, evento })
    }
  }
  return lista.sort((a, b) => a.dia - b.dia || a.evento.titulo.localeCompare(b.evento.titulo) || a.variante.localeCompare(b.variante))
}

export function prazosDoDia(prazos: PrazoDoMes[], dia: number): PrazoDoMes[] {
  return prazos.filter(p => p.dia === dia)
}

export type TomAlerta = 'dng' | 'warn' | 'info' | 'neu'

/** Mesmas faixas de alertaColor/alertaLabel de lib/calendario, em tom do Design System. */
export function tomDoAlerta(dias: number): TomAlerta {
  if (dias <= 1) return 'dng'
  if (dias <= 5) return 'warn'
  if (dias <= 10) return 'info'
  return 'neu'
}
