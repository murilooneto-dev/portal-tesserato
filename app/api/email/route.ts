import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

// Rate limit simples em memória: 10 e-mails por IP por minuto
const rateLimitMap = new Map<string, { count: number; ts: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.ts > 60_000) {
    rateLimitMap.set(ip, { count: 1, ts: now })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' }, { status: 429 })
  }

  const body = await request.json()
  const { para, assunto, corpo } = body

  if (!para || !assunto || !corpo) {
    return NextResponse.json({ error: 'Campos obrigatórios: para, assunto, corpo' }, { status: 400 })
  }

  // Validação básica de e-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(para)) {
    return NextResponse.json({ error: 'E-mail destinatário inválido.' }, { status: 400 })
  }

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
    to: para,
    subject: assunto,
    text: corpo,
  })

  return NextResponse.json({ ok: true })
}
