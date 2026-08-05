import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { montarLinhasRelatorio } from '@/lib/relatorio-fiscal'
import { gerarRelatorioFiscalPDF } from '@/lib/relatorio-fiscal-pdf'
import type { Tarefa } from '@/lib/types'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal, type ClienteComFiscal } from '@/lib/clientes-fiscal'

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem enviar os relatórios.' }, { status: 403 })

  const admin = createAdminClient()

  const { data: settings } = await admin.from('app_settings').select('email_destinatario').eq('id', 1).single()
  const destinatario = settings?.email_destinatario as string | undefined
  if (!destinatario) {
    return NextResponse.json({ error: 'Nenhum e-mail destinatário configurado em Parâmetros.' }, { status: 400 })
  }

  const agora = new Date()
  const mes = agora.getMonth() + 1
  const ano = agora.getFullYear()

  const [{ data: clientesRows, error: clientesErr }, tarefas] = await Promise.all([
    admin.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
    buscarTodasTarefasDoMes<Tarefa>(admin, mes, ano),
  ])
  if (clientesErr) return NextResponse.json({ error: clientesErr.message }, { status: 500 })

  const clientes = (clientesRows ?? []).map(flattenClienteFiscal) as ClienteComFiscal[]
  const responsaveis = Array.from(new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[])).sort()

  if (responsaveis.length === 0) {
    return NextResponse.json({ error: 'Nenhum responsável encontrado no setor Fiscal.' }, { status: 400 })
  }

  const mesNome = MESES_NOME[mes - 1]
  const anexos = await Promise.all(responsaveis.map(async responsavel => {
    const linhas = montarLinhasRelatorio(clientes.filter(c => c.responsavel === responsavel), tarefas)
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

  return NextResponse.json({ ok: true, enviados: anexos.length, responsaveis })
}
