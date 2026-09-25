import TabelaDetalhe from '@/components/tabelas/TabelaDetalhe'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string; semCliente?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  return <TabelaDetalhe setor="societario" id={id} pagina={sp.pagina} semCliente={sp.semCliente === '1'} />
}
