import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import FerramentasClient from './FerramentasClient'

export const metadata = { title: 'Ferramentas — Tesserato' }

export default async function FerramentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome,role,setores')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  let q = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome')
  if (!isAdmin && profile?.nome) q = q.ilike('clientes_fiscal.responsavel', profile.nome)

  // DET é do setor Pessoal: só quem tem o setor (ou admin) vê o cartão, e o
  // operador só vê os clientes em que é o responsável no Pessoal.
  const mostrarDet = isAdmin || ((profile?.setores ?? []) as string[]).includes('pessoal')
  let qDet = supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('clientes_pessoal.ativo', true).order('nome')
  if (!isAdmin && profile?.nome) qDet = qDet.ilike('clientes_pessoal.responsavel', profile.nome)

  const [{ data: clientes }, { data: clientesDet }] = await Promise.all([
    q,
    mostrarDet ? qDet : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  return (
    <FerramentasClient
      clientes={(clientes ?? []).map(flattenClienteFiscal)}
      clientesDet={(clientesDet ?? []).map(flattenClientePessoal)}
      mostrarDet={mostrarDet}
      isAdmin={isAdmin}
      userNome={profile?.nome ?? ''}
    />
  )
}
