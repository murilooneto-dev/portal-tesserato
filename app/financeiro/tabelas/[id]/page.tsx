import TabelaLeitura from '@/components/tabelas/TabelaLeitura'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TabelaLeitura setor="financeiro" id={id} />
}
