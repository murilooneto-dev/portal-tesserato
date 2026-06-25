import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EmpresaForm from '@/components/fiscal/EmpresaForm'
import { criarEmpresa } from '../actions'

export const metadata = { title: 'Nova Empresa — Tesserato Fiscal' }

export default async function NovaEmpresaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/fiscal/empresas" className="text-white/40 text-sm hover:text-white/70 transition-colors">
          ← Empresas
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Nova Empresa</h1>
      </div>
      <EmpresaForm action={criarEmpresa} submitLabel="Criar Empresa" />
    </div>
  )
}
