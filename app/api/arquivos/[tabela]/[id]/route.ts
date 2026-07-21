import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TABELAS: Record<string, string> = {
  tarefa: 'tarefa_arquivos',
  client: 'client_files',
}

function tipoContent(nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'csv': return 'text/csv'
    default: return 'application/octet-stream'
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tabela: string; id: string }> },
) {
  const { tabela, id } = await params
  const nomeTabela = TABELAS[tabela]
  if (!nomeTabela) {
    return NextResponse.json({ error: 'Tabela inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: arquivo } = await supabase
    .from(nomeTabela)
    .select('name, content_base64')
    .eq('id', id)
    .single()

  if (!arquivo) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const nome = arquivo.name as string
  const buffer = Buffer.from(arquivo.content_base64 as string, 'base64')
  const nomeAscii = nome.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': tipoContent(nome),
      'Content-Disposition': `inline; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
