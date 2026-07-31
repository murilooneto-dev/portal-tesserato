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

type VarianteData = 'interna' | 'oficial'

// Retorna a data-alvo de uma variante (interna ou oficial) do evento, ou
// null se essa variante não está preenchida nesse evento. Pra 'unica',
// a própria data (mesmo que já tenha passado). Pra 'recorrente', o dia
// do mês corrente se ainda não passou, senão o mesmo dia do mês seguinte
// — nunca fica no passado.
export function proximaOcorrencia(evento: CalendarioEvento, variante: VarianteData, hoje: Date = new Date()): Date | null {
  const diaMes = variante === 'interna' ? evento.interna_dia_mes : evento.oficial_dia_mes
  const dataUnica = variante === 'interna' ? evento.interna_data : evento.oficial_data

  if (evento.tipo_data === 'unica') {
    if (!dataUnica) return null
    return semHora(new Date(dataUnica + 'T00:00:00'))
  }

  if (diaMes == null) return null

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

// A data mais próxima que ainda não passou entre interna e oficial —
// usada pelo card do calendário e pelos badges do dashboard, onde as
// duas datas ficam visíveis lado a lado e o contador é só "o próximo
// prazo, seja ele qual for". Se só um lado existe, retorna esse. Se os
// dois já passaram (só possível com tipo_data 'unica'), retorna oficial.
export function proximoPrazo(evento: CalendarioEvento, hoje: Date = new Date()): Date {
  const interna = proximaOcorrencia(evento, 'interna', hoje)
  const oficial = proximaOcorrencia(evento, 'oficial', hoje)
  if (interna && !oficial) return interna
  if (oficial && !interna) return oficial

  const diasInterna = diasRestantes(interna!, hoje)
  const diasOficial = diasRestantes(oficial!, hoje)
  if (diasInterna >= 0 && diasOficial >= 0) return diasInterna <= diasOficial ? interna! : oficial!
  if (diasInterna >= 0) return interna!
  if (diasOficial >= 0) return oficial!
  return oficial!
}

// O prazo que conta como "operacional" pra equipe: interna quando
// existir, senão oficial. Usada na linha da tarefa no cliente — ali é
// uma ferramenta de trabalho da equipe, não o card informativo do
// calendário, e mostrar o prazo oficial quando o interno é mais
// apertado seria enganoso. Deliberadamente não chamada de "prazo
// limite" — esse termo é o que está em disputa entre interna/oficial.
export function prazoOperacional(evento: CalendarioEvento, hoje: Date = new Date()): Date | null {
  return proximaOcorrencia(evento, 'interna', hoje) ?? proximaOcorrencia(evento, 'oficial', hoje)
}

export function formatarDia(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// "Interno (05/08) · Oficial (10/08)" — omite o lado que não existe,
// sem imprimir "Oficial: —" no caso comum de só um lado preenchido.
export function labelDatas(evento: CalendarioEvento, hoje: Date = new Date()): string {
  const interna = proximaOcorrencia(evento, 'interna', hoje)
  const oficial = proximaOcorrencia(evento, 'oficial', hoje)
  const partes: string[] = []
  if (interna) partes.push(`Interno (${formatarDia(interna)})`)
  if (oficial) partes.push(`Oficial (${formatarDia(oficial)})`)
  return partes.join(' · ')
}

// Chave normalizada pra casar o título de um evento do calendário com
// o nome (tipo) de uma tarefa do cliente — sem acento, sem espaços nas
// pontas, case-insensitive.
export function normalizarTitulo(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
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
