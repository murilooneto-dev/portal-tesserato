// lib/financeiro-aviso-vencimento.ts
//
// Aviso de vencimento do Financeiro: partes puras (datas, destinatários e o
// texto do e-mail). A consulta ao banco e o envio ficam em
// lib/financeiro-aviso-vencimento-envio.ts.

import { formatarValor } from './financeiro-movimentos'

export interface PagamentoAVencer {
  /** Nome do tipo de saída (ex.: "Aluguel"). */
  tipo: string
  observacao: string | null
  /** YYYY-MM-DD */
  data: string
  valor: number
}

/**
 * Dia seguinte a `dataISO` (YYYY-MM-DD). Conta em UTC, sem `Date` local, pra
 * não escorregar um dia por causa do fuso (ver lib/formatar-data.ts).
 */
export function diaSeguinte(dataISO: string): string {
  const m = dataISO.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  return d.toISOString().slice(0, 10)
}

/** "2026-10-07" → "07/10/2026" */
export function formatarDataBR(dataISO: string): string {
  const m = dataISO.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dataISO
}

const EMAIL_VALIDO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/**
 * Separa os destinatários digitados (vírgula, ponto e vírgula ou quebra de
 * linha), tira repetidos e diz quais não têm cara de e-mail.
 */
export function separarEmails(texto: string | null | undefined): { validos: string[]; invalidos: string[] } {
  const validos: string[] = []
  const invalidos: string[] = []
  for (const parte of (texto ?? '').split(/[,;\n]/)) {
    const email = parte.trim()
    if (!email) continue
    if (!EMAIL_VALIDO.test(email)) invalidos.push(email)
    else if (!validos.some(v => v.toLowerCase() === email.toLowerCase())) validos.push(email)
  }
  return { validos, invalidos }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function nomeDoPagamento(p: PagamentoAVencer): string {
  return p.observacao ? `${p.tipo} · ${p.observacao}` : p.tipo
}

/** Assunto, texto simples e HTML do e-mail com os pagamentos que vencem em `vencimento`. */
export function montarEmailAviso(
  pagamentos: PagamentoAVencer[],
  vencimento: string,
  opcoes: { teste?: boolean } = {},
): { subject: string; text: string; html: string } {
  const dia = formatarDataBR(vencimento)
  const total = pagamentos.reduce((soma, p) => soma + p.valor, 0)
  const prefixo = opcoes.teste ? '[Teste] ' : ''
  const subject = `${prefixo}Pagamentos que vencem amanhã (${dia.slice(0, 5)})`

  if (pagamentos.length === 0) {
    const frase = `Nenhuma conta a pagar vence em ${dia}.`
    return { subject, text: frase, html: `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">${frase}</p>` }
  }

  const abertura = pagamentos.length === 1
    ? `1 conta a pagar vence amanhã, ${dia}, e ainda não foi paga:`
    : `${pagamentos.length} contas a pagar vencem amanhã, ${dia}, e ainda não foram pagas:`

  const text = [
    abertura,
    '',
    ...pagamentos.map(p => `- ${nomeDoPagamento(p)} | ${formatarDataBR(p.data)} | ${formatarValor(p.valor)}`),
    '',
    `Total: ${formatarValor(total)}`,
  ].join('\n')

  const celula = 'padding:8px 12px;border-bottom:1px solid #e5e7eb'
  const linhas = pagamentos.map(p => `
      <tr>
        <td style="${celula}">${escaparHtml(nomeDoPagamento(p))}</td>
        <td style="${celula};white-space:nowrap">${formatarDataBR(p.data)}</td>
        <td style="${celula};text-align:right;white-space:nowrap">${formatarValor(p.valor)}</td>
      </tr>`).join('')

  const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
  <p>${abertura}</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:420px">
    <thead>
      <tr style="background:#f3f4f6;text-align:left">
        <th style="padding:8px 12px">Pagamento</th>
        <th style="padding:8px 12px">Data de vencimento</th>
        <th style="padding:8px 12px;text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>${linhas}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="padding:8px 12px;font-weight:bold">Total</td>
        <td style="padding:8px 12px;text-align:right;font-weight:bold;white-space:nowrap">${formatarValor(total)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="color:#6b7280;font-size:12px">Aviso automático do portal Tesserato · Financeiro › Pagamentos.</p>
</div>`

  return { subject, text, html }
}
