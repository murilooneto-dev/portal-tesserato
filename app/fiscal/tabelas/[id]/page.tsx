import TabelaDetalhe from '@/components/tabelas/TabelaDetalhe'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string; q?: string; filtros?: string; ordem?: string; dir?: string; semCliente?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  return <TabelaDetalhe setor="fiscal" id={id} params={sp} />
}
