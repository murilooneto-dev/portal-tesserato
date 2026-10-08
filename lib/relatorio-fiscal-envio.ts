// lib/relatorio-fiscal-envio.ts
//
// Relatórios do Fiscal por e-mail: monta um PDF por responsável e manda tudo
// num e-mail só para o destinatário de Parâmetros. Usado pelo botão "Enviar
// relatórios agora" (app/api/relatorios/fiscal) e pelo envio agendado
// (app/api/cron/fiscal-relatorios). Só no servidor.

import nodemailer from 'nodemailer'
import type { createAdminClient } from './supabase/server'
import { buscarTodasTarefasDoMes } from './tarefas-paginacao'
import { montarLinhasRelatorio } from './relatorio-fiscal'
import { gerarRelatorioFiscalPDF } from './relatorio-fiscal-pdf'
import { buscarMapaVinculosSetor } from './tarefas-esperadas'
import { buscarDonoNomePorTipo } from './tarefa-tipo-donos'
import type { Tarefa } from './types'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal, type ClienteComFiscal } from './clientes-fiscal'
import { agoraSP, envioDevido, type EnvioDevido, type RotinaConfig } from './relatorio-fiscal-agenda'

type Admin = ReturnType<typeof createAdminClient>

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export type ResultadoEnvioRelatorios =
  | { ok: true; enviados: number; responsaveis: string[] }
  | { ok: false; status: number; error: string }

/** Gera os relatórios de `mes`/`ano` e manda para o destinatário de Parâmetros. */
export async function enviarRelatoriosFiscal(admin: Admin, { mes, ano }: { mes: number; ano: number }): Promise<ResultadoEnvioRelatorios> {
  const { data: settings } = await admin.from('app_settings').select('email_destinatario').eq('id', 1).single()
  const destinatario = settings?.email_destinatario as string | undefined
  if (!destinatario) {
    return { ok: false, status: 400, error: 'Nenhum e-mail destinatário configurado em Parâmetros.' }
  }

  const [{ data: clientesRows, error: clientesErr }, tarefas, mapaVinculos, donoNomePorTipo] = await Promise.all([
    admin.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
    buscarTodasTarefasDoMes<Tarefa>(admin, mes, ano),
    buscarMapaVinculosSetor(admin, 'fiscal', { mes, ano }),
    buscarDonoNomePorTipo(admin, 'fiscal'),
  ])
  if (clientesErr) return { ok: false, status: 500, error: clientesErr.message }

  const clientes = (clientesRows ?? []).map(flattenClienteFiscal) as ClienteComFiscal[]
  const responsaveis = Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[])).sort()

  if (responsaveis.length === 0) {
    return { ok: false, status: 400, error: 'Nenhum responsável encontrado no setor Fiscal.' }
  }

  const mesNome = MESES_NOME[mes - 1]
  const anexos = await Promise.all(responsaveis.map(async responsavel => {
    const linhas = montarLinhasRelatorio(clientes.filter(c => c.responsavel === responsavel), tarefas, mapaVinculos, donoNomePorTipo)
    const pdf = await gerarRelatorioFiscalPDF({ responsavel, mesNome, ano, linhas })
    return { filename: `relatorio-fiscal-${responsavel}-${mes}-${ano}.pdf`.replace(/\s+/g, '-'), content: pdf }
  }))

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })

  await transporter.sendMail({
    from: `"Tesserato Fiscal" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: `Relatórios Fiscais por Responsável — ${mesNome}/${ano}`,
    text: `Segue em anexo o relatório de tarefas fiscais de cada responsável, referente a ${mesNome}/${ano}.`,
    attachments: anexos,
  })

  return { ok: true, enviados: anexos.length, responsaveis }
}

export type ResultadoRotinas =
  | { status: 'desligado' }
  | { status: 'nada_agora' }
  | { status: 'ja_enviado' }
  | { status: 'enviado'; rotinas: number[]; enviados: number; responsaveis: string[]; mes: number; ano: number }

const ROTINAS = [1, 2] as const
const ligado = (v: unknown) => String(v) === 'true'

/**
 * Envio agendado: confere as duas rotinas de Parâmetros e manda os relatórios
 * se alguma estiver na hora. O envio é reservado no banco ANTES de mandar
 * (duas chamadas simultâneas não mandam em dobro) e devolvido se falhar, para
 * a próxima chamada tentar de novo. Duas rotinas na mesma hora mandam um
 * e-mail só.
 */
export async function enviarRelatoriosFiscalAgendados(admin: Admin, agora = agoraSP()): Promise<ResultadoRotinas> {
  const { data: config, error } = await admin
    .from('app_settings')
    .select('email_ativo, rotina1_ativo, rotina1_dia, rotina1_hora, rotina1_ultimo_envio, rotina2_ativo, rotina2_dia, rotina2_hora, rotina2_ultimo_envio')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const s = (config ?? {}) as Record<string, unknown>
  if (!ligado(s.email_ativo)) return { status: 'desligado' }

  const devidas: { n: number; envio: EnvioDevido; anterior: string | null }[] = []
  for (const n of ROTINAS) {
    const rotina: RotinaConfig = {
      ativo: ligado(s[`rotina${n}_ativo`]),
      dia: String(s[`rotina${n}_dia`] ?? ''),
      hora: String(s[`rotina${n}_hora`] ?? ''),
      ultimoEnvio: (s[`rotina${n}_ultimo_envio`] ?? null) as string | null,
    }
    const envio = envioDevido(rotina, agora)
    if (envio) devidas.push({ n, envio, anterior: rotina.ultimoEnvio })
  }
  if (devidas.length === 0) return { status: 'nada_agora' }

  const reservadas: typeof devidas = []
  for (const d of devidas) {
    const coluna = `rotina${d.n}_ultimo_envio`
    const { data: linhas, error: erroReserva } = await admin
      .from('app_settings')
      .update({ [coluna]: d.envio.chave })
      .eq('id', 1)
      .or(`${coluna}.is.null,${coluna}.neq.${d.envio.chave}`)
      .select('id')
    if (erroReserva) throw new Error(erroReserva.message)
    if (linhas && linhas.length > 0) reservadas.push(d)
  }
  if (reservadas.length === 0) return { status: 'ja_enviado' }

  const devolver = async () => {
    for (const d of reservadas) {
      await admin.from('app_settings').update({ [`rotina${d.n}_ultimo_envio`]: d.anterior }).eq('id', 1)
    }
  }

  const { mes, ano } = reservadas[0].envio
  let resultado: ResultadoEnvioRelatorios
  try {
    resultado = await enviarRelatoriosFiscal(admin, { mes, ano })
  } catch (e) {
    await devolver()
    throw e
  }
  if (!resultado.ok) {
    await devolver()
    throw new Error(resultado.error)
  }
  return { status: 'enviado', rotinas: reservadas.map(d => d.n), enviados: resultado.enviados, responsaveis: resultado.responsaveis, mes, ano }
}
