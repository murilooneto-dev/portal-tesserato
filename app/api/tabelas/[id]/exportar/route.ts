import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ehUuid } from '@/lib/tabelas/editar-celula'
import { parseConsulta } from '@/lib/tabelas/consulta'
import { consultarLinhas, type LinhaConsultada } from '@/lib/tabelas/consultar'
import { montarXlsx, nomeArquivoSeguro } from '@/lib/tabelas/exportar-xlsx'
import type { TipoColuna } from '@/lib/tabelas/tipos'

const LOTE = 1000
const MAX_LINHAS_EXPORT = 20000
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'Tabela inválida.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  // Cliente do USUÁRIO: a RLS por setor decide quem lê. Quem não é do setor
  // recebe o mesmo 404 de uma tabela que não existe.
  const { data: planilha } = await supabase.from('planilhas').select('id, nome').eq('id', id).maybeSingle()
  if (!planilha) return NextResponse.json({ error: 'Tabela não encontrada.' }, { status: 404 })

  const { data: colunasRaw } = await supabase
    .from('planilha_colunas').select('id, nome, tipo').eq('planilha_id', id).order('ordem')
  const colunas = (colunasRaw ?? []) as { id: string; nome: string; tipo: TipoColuna }[]

  const sp = new URL(request.url).searchParams
  const consulta = parseConsulta({
    q: sp.get('q') ?? undefined,
    filtros: sp.get('filtros') ?? undefined,
    ordem: sp.get('ordem') ?? undefined,
    dir: sp.get('dir') ?? undefined,
    semCliente: sp.get('semCliente') ?? undefined,
  }, colunas)

  const linhas: LinhaConsultada[] = []
  for (let offset = 0; offset < MAX_LINHAS_EXPORT; offset += LOTE) {
    const r = await consultarLinhas(supabase, id, consulta, colunas, offset, LOTE)
    if (r.error) return NextResponse.json({ error: 'Não foi possível gerar o arquivo.' }, { status: 500 })
    linhas.push(...r.linhas)
    if (r.linhas.length < LOTE || linhas.length >= r.total) break
  }

  const bytes = montarXlsx(planilha.nome as string, colunas, linhas)
  const arquivo = nomeArquivoSeguro(planilha.nome as string)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Response(new Blob([buffer], { type: XLSX_MIME }), {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
