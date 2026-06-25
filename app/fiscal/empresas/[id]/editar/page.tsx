import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EmpresaForm from '@/components/fiscal/EmpresaForm'
import { atualizarEmpresa } from '../../actions'

export const metadata = { title: 'Editar Empresa — Tesserato Fiscal' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditarEmpresaPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  const updateWithId = atualizarEmpresa.bind(null, id)

  // Parse municipio/uf from mit field (stored as "Cidade/UF")
  const mitParts = cliente.mit?.split('/') ?? []
  const municipio = mitParts[0] ?? ''
  const uf = mitParts[1] ?? ''

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/fiscal/empresas" className="text-white/40 text-sm hover:text-white/70 transition-colors">
          ← Empresas
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Editar: {cliente.nome}</h1>
      </div>
      <EmpresaForm
        defaultValues={{ ...cliente, municipio, uf }}
        action={updateWithId}
        submitLabel="Salvar Alterações"
      />
    </div>
  )
}
