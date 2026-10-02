// lib/agenda.ts — regras da agenda pessoal (Início e /fiscal/agenda).
// Funções puras, sem React e sem Supabase; testadas em tests/agenda.test.ts.
// `mes` sempre de 1 a 12.
import { MESES } from './mes-navegacao'

export type StatusCompromisso = 'pendente' | 'concluido' | 'cancelado'
export type TomCompromisso = 'warn' | 'acc' | 'ok' | 'neu'

export interface Compromisso {
  id: string
  usuario_id: string
  titulo: string
  descricao?: string | null
  data_compromisso: string // aaaa-mm-dd
  hora_compromisso?: string | null // hh:mm (pode vir com segundos)
  status: StatusCompromisso
  lembrete_3_dias: boolean
}

export type FormCompromisso = Pick<Compromisso, 'titulo' | 'descricao' | 'data_compromisso' | 'hora_compromisso' | 'status' | 'lembrete_3_dias'>

export const STATUS_ROTULO: Record<StatusCompromisso, string> = { pendente: 'Pendente', concluido: 'Concluído', cancelado: 'Cancelado' }
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

const dois = (n: number) => String(n).padStart(2, '0')

export function chaveDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${dois(mes)}-${dois(dia)}`
}

export function chaveDeHoje(hoje: Date): string {
  return chaveDia(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())
}

/** Grade do mês começando no domingo; `null` = casa vazia. Sempre múltiplo de 7. */
export function celulasDoMes(ano: number, mes: number): (number | null)[] {
  const primeiro = new Date(ano, mes - 1, 1).getDay()
  const dias = new Date(ano, mes, 0).getDate()
  const celulas: (number | null)[] = Array.from({ length: primeiro }, () => null)
  for (let d = 1; d <= dias; d++) celulas.push(d)
  while (celulas.length % 7 !== 0) celulas.push(null)
  return celulas
}

/** Dias corridos de hoje até a data (negativo = já passou). Conta em UTC para não sofrer com horário de verão. */
export function diasAte(data: string, hoje: Date): number {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86_400_000)
}

function dentroDe3Dias(data: string, hoje: Date): boolean {
  const d = diasAte(data, hoje)
  return d >= 0 && d <= 3
}

/** Cor no calendário. Legenda: Pendente em até 3 dias (âmbar) · Pendente (ciano) · Concluído (verde) · Cancelado (cinza). */
export function tomDoCompromisso(c: Pick<Compromisso, 'status' | 'data_compromisso' | 'lembrete_3_dias'>, hoje: Date): TomCompromisso {
  if (c.status === 'concluido') return 'ok'
  if (c.status === 'cancelado') return 'neu'
  if (c.lembrete_3_dias && dentroDe3Dias(c.data_compromisso, hoje)) return 'warn'
  return 'acc'
}

/** Pelo horário; sem horário vai para o fim do dia. */
function porHorario(a: Compromisso, b: Compromisso): number {
  return (a.hora_compromisso || '99:99').localeCompare(b.hora_compromisso || '99:99') || a.titulo.localeCompare(b.titulo)
}

export function compromissosDoDia(itens: Compromisso[], chave: string): Compromisso[] {
  return itens.filter(i => i.data_compromisso === chave).sort(porHorario)
}

/** Pendentes de hoje até daqui a 3 dias, do mais próximo para o mais distante. */
export function lembretesProximos(itens: Compromisso[], hoje: Date): Compromisso[] {
  return itens
    .filter(i => i.status === 'pendente' && dentroDe3Dias(i.data_compromisso, hoje))
    .sort((a, b) => a.data_compromisso.localeCompare(b.data_compromisso) || porHorario(a, b))
}

export function horaCurta(hora?: string | null): string {
  return hora ? hora.slice(0, 5) : ''
}

/** "Hoje 09:00 · Enviar SPED", "Amanhã · Ligar", "03/10 14:00 · Reunião". */
export function rotuloLembrete(c: Compromisso, hoje: Date): string {
  const d = diasAte(c.data_compromisso, hoje)
  const [, m, dia] = c.data_compromisso.split('-')
  const quando = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `${dia}/${m}`
  const hora = horaCurta(c.hora_compromisso)
  return `${quando}${hora ? ` ${hora}` : ''} · ${c.titulo}`
}

/** "30 de setembro de 2026" */
export function tituloDoDia(ano: number, mes: number, dia: number): string {
  return `${dia} de ${MESES[mes - 1].toLowerCase()} de ${ano}`
}

export function contarCompromissos(n: number): string {
  return n === 0 ? 'Nenhum compromisso' : n === 1 ? '1 compromisso' : `${n} compromissos`
}

export function formVazio(data = ''): FormCompromisso {
  return { titulo: '', descricao: '', data_compromisso: data, hora_compromisso: '', status: 'pendente', lembrete_3_dias: false }
}

/** AAAA-MM-DD que existe no calendário (recusa 2026-02-30 e 2026-13-45). */
function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function validarCompromisso(f: FormCompromisso): { titulo?: string; data_compromisso?: string } {
  const erros: { titulo?: string; data_compromisso?: string } = {}
  if (!f.titulo.trim()) erros.titulo = 'Informe o título.'
  if (!dataValida(f.data_compromisso)) erros.data_compromisso = 'Informe a data.'
  return erros
}

/** O que vai para o banco: título sem espaços nas pontas; descrição e horário vazios viram null. */
export function payloadCompromisso(f: FormCompromisso): FormCompromisso {
  return { ...f, titulo: f.titulo.trim(), descricao: f.descricao?.trim() || null, hora_compromisso: f.hora_compromisso || null }
}
