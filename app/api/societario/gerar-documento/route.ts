import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarDocumentoProcedimentoPDF } from '@/lib/documento-procedimento-pdf'

interface Body {
  modeloNome: string
  empresa: string
  processoNome: string
  responsavel: string | null
  campos: { etapa: string; valor: string }[]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await request.json()) as Body
  if (!body.modeloNome || !body.empresa || !body.processoNome) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  const pdf = await gerarDocumentoProcedimentoPDF({
    modeloNome: body.modeloNome,
    empresa: body.empresa,
    processoNome: body.processoNome,
    responsavel: body.responsavel,
    campos: body.campos ?? [],
  })

  const nomeArquivo = `${body.modeloNome}-${body.empresa}`.replace(/[^\w\-]+/g, '_') + '.pdf'

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
