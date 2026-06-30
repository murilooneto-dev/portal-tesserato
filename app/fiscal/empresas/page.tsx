import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EmpresasClient from './EmpresasClient'

export const metadata = { title: 'Empresas — Tesserato Fiscal' }

export default async function EmpresasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()

  const { data: clientes } = await supabase.from('clientes').select('*').order('nome')

  const TAREFAS_GRUPOS: Record<string, string[]> = {
    normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
    simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
    mei:     ['DAS'],
  }

  // Conta tarefas configuradas por cliente (template, não registros do banco)
  const contagemTarefas: Record<string, number> = {}
  for (const c of clientes ?? []) {
    const tipos = (c.tarefas_personalizadas?.length > 0)
      ? (c.tarefas_personalizadas as string[])
      : (TAREFAS_GRUPOS[c.grupo ?? 'normal'] ?? TAREFAS_GRUPOS.normal)
    contagemTarefas[c.id] = tipos.length
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <EmpresasClient clientes={clientes ?? []} contagemTarefas={contagemTarefas} profileNome={profile?.nome ?? null} isAdmin={isAdmin} />
    </div>
  )
}
