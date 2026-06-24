import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('*')
    .order('nome')

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <p className="text-white/40 mt-1 text-sm">Carteira de clientes do escritório</p>
      </div>
      <ClientesLista clientes={clientes ?? []} />
    </div>
  )
}
