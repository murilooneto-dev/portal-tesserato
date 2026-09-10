import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientesGeralLista from '@/components/geral/ClientesGeralLista'
import type { TarefaVinculo } from '@/lib/types'
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'

export const metadata = { title: 'Clientes — Tesserato' }

export default async function ClientesGeralPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: clientes }, { data: usuariosFiscal }, { data: vinculosCatalogo }] = await Promise.all([
    supabase.from('profiles').select('role, setores').eq('id', user.id).single(),
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
  ])

  const isAdmin = profile?.role === 'admin'
  // Societário precisa cadastrar cliente aqui na tela geral antes de
  // vincular ao setor deles — ver app/(comum)/clientes/actions.ts.
  const podeCriar = isAdmin || (profile?.setores ?? []).includes('societario')

  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()

  const catalogoFiscal = await buscarCatalogoCliente(supabase, 'fiscal')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ClientesGeralLista
        clientes={clientes ?? []}
        isAdmin={isAdmin}
        podeCriar={podeCriar}
        responsaveis={responsaveis}
        vinculosCatalogo={(vinculosCatalogo ?? []) as TarefaVinculo[]}
        catalogoFiscal={catalogoFiscal}
      />
    </div>
  )
}
