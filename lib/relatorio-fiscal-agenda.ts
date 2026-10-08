// lib/relatorio-fiscal-agenda.ts
//
// Relatórios automáticos do Fiscal por e-mail: partes puras (relógio de São
// Paulo e a conta de "esta rotina está na hora?"). O dia e o horário de cada
// rotina vêm de Parâmetros (app_settings). A consulta ao banco e o envio ficam
// em lib/relatorio-fiscal-envio.ts.

/** Relógio de parede de São Paulo. */
export interface MomentoSP {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
}

export interface RotinaConfig {
  ativo: boolean
  /** Dia do mês, como está gravado ("14"). */
  dia: string
  /** Horário, como está gravado ("16:20"). */
  hora: string
  /** Chave do último envio feito por esta rotina (AAAAMMDDHHMM) ou nulo. */
  ultimoEnvio: string | null
}

export interface EnvioDevido {
  /** Chave do envio (AAAAMMDDHHMM do dia e horário marcados). */
  chave: string
  /** Mês e ano do relatório: os do dia marcado. */
  mes: number
  ano: number
}

/**
 * Quanto tempo depois do horário marcado o envio ainda sai. Quem chama a
 * rotina (GitHub Actions) pode atrasar ou pular rodadas; passou disso, aquele
 * mês fica sem o envio em vez de sair num horário sem sentido.
 */
export const JANELA_ENVIO_MIN = 12 * 60

/** Data e hora de agora no fuso de São Paulo. */
export function agoraSP(data: Date = new Date()): MomentoSP {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data)
  const n = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value)
  return { ano: n('year'), mes: n('month'), dia: n('day'), hora: n('hour'), minuto: n('minute') }
}

/** Minutos corridos do relógio de parede (UTC só como régua, sem fuso). */
function emMinutos(m: MomentoSP): number {
  return Date.UTC(m.ano, m.mes - 1, m.dia, m.hora, m.minuto) / 60000
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

const dois = (n: number) => String(n).padStart(2, '0')

/** "202610141620" → "14/10/2026 às 16:20"; vazio se a chave não tiver esse formato. */
export function formatarChaveEnvio(chave: string | null | undefined): string {
  const m = (chave ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : ''
}

/**
 * Diz se a rotina deve enviar agora. Envia quando o dia e o horário marcados
 * já chegaram, há no máximo JANELA_ENVIO_MIN, e esse envio ainda não foi
 * feito. Dia maior que o mês (31 em novembro) vale como o último dia. Olha
 * também o mês anterior, para o horário marcado perto da meia-noite do
 * último dia não se perder na virada.
 */
export function envioDevido(rotina: RotinaConfig, agora: MomentoSP): EnvioDevido | null {
  if (!rotina.ativo) return null
  const dia = Number(rotina.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return null
  const h = rotina.hora.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/)
  if (!h) return null
  const hora = Number(h[1])
  const minuto = Number(h[2])

  const mesAnterior = agora.mes === 1 ? { ano: agora.ano - 1, mes: 12 } : { ano: agora.ano, mes: agora.mes - 1 }
  for (const { ano, mes } of [{ ano: agora.ano, mes: agora.mes }, mesAnterior]) {
    const diaReal = Math.min(dia, ultimoDiaDoMes(ano, mes))
    const atraso = emMinutos(agora) - emMinutos({ ano, mes, dia: diaReal, hora, minuto })
    if (atraso < 0 || atraso > JANELA_ENVIO_MIN) continue
    const chave = `${ano}${dois(mes)}${dois(diaReal)}${dois(hora)}${dois(minuto)}`
    return chave === rotina.ultimoEnvio ? null : { chave, mes, ano }
  }
  return null
}
