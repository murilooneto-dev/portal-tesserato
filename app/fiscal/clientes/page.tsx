import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

const TAREFAS_GRUPOS: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}

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

  // Tipos válidos por cliente (personalizado ou padrão do grupo)
  const clienteTiposSet: Record<string, Set<string>> = {}
  for (const c of clientes ?? []) {
    const tipos = ((c.tarefas_personalizadas?.length ?? 0) > 0)
      ? (c.tarefas_personalizadas as string[])
      : (TAREFAS_GRUPOS[c.grupo ?? 'normal'] ?? TAREFAS_GRUPOS.normal)
    clienteTiposSet[c.id] = new Set(tipos)
  }

  // Progresso por cliente: total = tarefas configuradas, concluidas = registros concluídos no banco
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [clienteId, tiposSet] of Object.entries(clienteTiposSet)) {
    progressoMap[clienteId] = { total: tiposSet.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && clienteTiposSet[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  // Clientes com pendência: tipos configurados e ainda não todos concluídos
  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
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
