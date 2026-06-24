import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { para, assunto, corpo } = await request.json()

  if (!para || !assunto || !corpo) {
    return NextResponse.json({ error: 'Campos obrigatórios: para, assunto, corpo' }, { status: 400 })
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
