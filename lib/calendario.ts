// lib/calendario.ts
import type { CalendarioEvento } from './types'

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

function semHora(d: Date): Date {
  const copia = new Date(d)
  copia.setHours(0, 0, 0, 0)
  return copia
}

// Retorna a data-alvo do evento: pra 'unica', a própria data (mesmo
// que já tenha passado). Pra 'recorrente', o dia do mês corrente se
// ainda não passou, senão o mesmo dia do mês seguinte — nunca fica
// no passado.
export function proximaOcorrencia(evento: CalendarioEvento, hoje: Date = new Date()): Date {
  if (evento.tipo_data === 'unica') {
    return semHora(new Date(evento.data + 'T00:00:00'))
  }

  const diaMes = evento.dia_mes!
  const hojeSemHora = semHora(hoje)
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  const diaEsteMes = Math.min(diaMes, ultimoDiaDoMes(anoAtual, mesAtual))
  const dataEsteMes = semHora(new Date(anoAtual, mesAtual - 1, diaEsteMes))
  if (dataEsteMes >= hojeSemHora) return dataEsteMes

  const proxMes = mesAtual === 12 ? 1 : mesAtual + 1
  const proxAno = mesAtual === 12 ? anoAtual + 1 : anoAtual
  const diaProxMes = Math.min(diaMes, ultimoDiaDoMes(proxAno, proxMes))
  return semHora(new Date(proxAno, proxMes - 1, diaProxMes))
}

// Pode ser negativo — só acontece pra eventos 'unica' já vencidos
// (recorrente sempre rola pro futuro, nunca fica negativo).
export function diasRestantes(dataAlvo: Date, hoje: Date = new Date()): number {
  const a = semHora(dataAlvo)
  const h = semHora(hoje)
  return Math.round((a.getTime() - h.getTime()) / 86400000)
}

export function alertaColor(dias: number): string {
  if (dias <= 1) return 'border-red-500 bg-red-500/10'
  if (dias <= 5) return 'border-orange-500 bg-orange-500/10'
  if (dias <= 10) return 'border-blue-500 bg-blue-500/10'
  return 'border-[var(--fg)]/10 bg-[var(--fg)]/3'
}

export function alertaLabel(dias: number): { text: string; cls: string } {
  if (dias < 0) return { text: `Vencido há ${Math.abs(dias)}d`, cls: 'text-red-400' }
  if (dias === 0) return { text: 'Vence hoje', cls: 'text-red-400' }
  if (dias === 1) return { text: 'Vence amanhã', cls: 'text-red-400' }
  if (dias <= 5) return { text: `${dias}d restantes`, cls: 'text-orange-400' }
  if (dias <= 10) return { text: `${dias}d restantes`, cls: 'text-blue-400' }
  return { text: `${dias}d restantes`, cls: 'text-[var(--fg)]/50' }
}
