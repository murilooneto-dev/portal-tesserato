import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

const TIPOS_VALIDOS = new Set([
  'ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST',
  'IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS',
  'FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF','DAS',
])

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()

  let clientesQ = supabase.from('clientes').select('*').order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('responsavel', profile.nome)

  const [{ data: clientes }, { data: tarefas }] = await Promise.all([
    clientesQ,
    supabase
      .from('tarefas')
      .select('cliente_id, concluida, tipo')
      .eq('mes', mes)
      .eq('ano', ano),
  ])

  // Progresso por cliente no mês — conta apenas tipos válidos
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const t of tarefas ?? []) {
    if (!TIPOS_VALIDOS.has(t.tipo)) continue
    if (!progressoMap[t.cliente_id]) progressoMap[t.cliente_id] = { total: 0, concluidas: 0 }
    progressoMap[t.cliente_id].total++
    if (t.concluida) progressoMap[t.cliente_id].concluidas++
  }

  // Monta set de cliente_ids com pelo menos 1 tarefa pendente (tipos válidos)
  const comPendencia = new Set(
    (tarefas ?? []).filter(t => TIPOS_VALIDOS.has(t.tipo) && !t.concluida).map(t => t.cliente_id)
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes ?? []}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
      />
    </div>
  )
}
