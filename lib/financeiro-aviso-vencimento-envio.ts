// lib/financeiro-aviso-vencimento-envio.ts
//
// Aviso de vencimento do Financeiro: consulta as contas a pagar (saídas não
// pagas) que vencem amanhã e manda o e-mail. Usado pelo
// envio agendado (app/api/cron/financeiro-aviso-vencimento) e pelo botão
// "Enviar teste agora" de Configurações do Financeiro. Só no servidor.

import nodemailer from 'nodemailer'
import type { createAdminClient } from './supabase/server'
import { hojeISO } from './mes-atual'
import { nomeDaConta } from './financeiro-movimentos'
import { diaSeguinte, montarEmailAviso, separarEmails, type PagamentoAVencer } from './financeiro-aviso-vencimento'

type Admin = ReturnType<typeof createAdminClient>

export type ResultadoAviso =
  | { status: 'enviado'; quantidade: number; vencimento: string; destinatarios: string[] }
  | { status: 'sem_destinatario' }
  | { status: 'nada_a_vencer'; vencimento: string }
  | { status: 'ja_enviado' }

interface LinhaMovimento {
  valor: number
  data: string
  observacao: string | null
  descricao: string | null
  financeiro_tipos: { nome: string } | { nome: string }[] | null
}

async function buscarPagamentosQueVencem(admin: Admin, vencimento: string): Promise<PagamentoAVencer[]> {
  const { data, error } = await admin
    .from('financeiro_movimentos')
    .select('valor, data, observacao, descricao, financeiro_tipos(nome)')
    .eq('natureza', 'saida')
    .eq('pago', false)
    .eq('data', vencimento)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as LinhaMovimento[])
    .map(m => {
      const tipo = Array.isArray(m.financeiro_tipos) ? m.financeiro_tipos[0] : m.financeiro_tipos
      // Conta Única não tem cadastro: o nome é a descrição.
      const nome = nomeDaConta(tipo?.nome, m.descricao)
      return { tipo: nome === '—' ? 'Pagamento' : nome, observacao: m.observacao, data: m.data, valor: Number(m.valor) }
    })
    .sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'))
}

async function enviarEmail(destinatarios: string[], email: { subject: string; text: string; html: string }) {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error('Envio de e-mail não configurado (EMAIL_HOST, EMAIL_USER e EMAIL_PASS na Vercel).')
  }
  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  })
  await transporter.sendMail({
    from: `"Tesserato Financeiro" <${EMAIL_USER}>`,
    to: destinatarios,
    ...email,
  })
}

/**
 * Manda o aviso das contas a pagar que vencem amanhã.
 * - Envio agendado (`teste: false`): só manda se houver o que avisar e se
 *   ainda não mandou hoje. O dia é reservado no banco ANTES do envio (duas
 *   chamadas simultâneas não mandam em dobro) e devolvido se o envio falhar.
 * - Teste (`teste: true`): manda sempre, mesmo sem nada a vencer, e não mexe
 *   no controle do envio do dia.
 */
export async function enviarAvisoVencimento(admin: Admin, opcoes: { teste?: boolean } = {}): Promise<ResultadoAviso> {
  const teste = opcoes.teste === true

  const { data: config, error: erroConfig } = await admin
    .from('financeiro_config')
    .select('email_aviso_vencimento, aviso_vencimento_ultimo_envio')
    .eq('id', 1)
    .maybeSingle()
  if (erroConfig) throw new Error(erroConfig.message)

  const destinatarios = separarEmails(config?.email_aviso_vencimento).validos
  if (destinatarios.length === 0) return { status: 'sem_destinatario' }

  const hoje = hojeISO()
  const vencimento = diaSeguinte(hoje)
  const pagamentos = await buscarPagamentosQueVencem(admin, vencimento)

  if (teste) {
    await enviarEmail(destinatarios, montarEmailAviso(pagamentos, vencimento, { teste: true }))
    return { status: 'enviado', quantidade: pagamentos.length, vencimento, destinatarios }
  }

  if (pagamentos.length === 0) return { status: 'nada_a_vencer', vencimento }

  const anterior = (config?.aviso_vencimento_ultimo_envio ?? null) as string | null
  const { data: reservado, error: erroReserva } = await admin
    .from('financeiro_config')
    .update({ aviso_vencimento_ultimo_envio: hoje })
    .eq('id', 1)
    .or(`aviso_vencimento_ultimo_envio.is.null,aviso_vencimento_ultimo_envio.lt.${hoje}`)
    .select('id')
  if (erroReserva) throw new Error(erroReserva.message)
  if (!reservado || reservado.length === 0) return { status: 'ja_enviado' }

  try {
    await enviarEmail(destinatarios, montarEmailAviso(pagamentos, vencimento))
  } catch (e) {
    await admin.from('financeiro_config').update({ aviso_vencimento_ultimo_envio: anterior }).eq('id', 1)
    throw e
  }
  return { status: 'enviado', quantidade: pagamentos.length, vencimento, destinatarios }
}
