import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogsEventosClient from './LogsEventosClient'

export const metadata = { title: 'Logs do sistema — Tesserato' }

interface Props {
  searchParams: Promise<{ aba?: string; tipo?: string; setor?: string; clienteId?: string; item?: string; de?: string; ate?: string }>
}

export default async function LogsEventosPage({ searchParams }: Props) {
  const { aba, tipo, setor, clienteId, item, de, ate } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  let query = supabase.from('evento_log').select('*').order('created_at', { ascending: false }).limit(1000)
  if (tipo) query = query.eq('tipo_evento', tipo)
  if (setor === 'geral') query = query.is('setor', null)
  else if (setor) query = query.eq('setor', setor)
  if (clienteId) query = query.eq('cliente_id', clienteId)
  // Tipo do item criado/excluído (gravado pelas triggers da 058 e pela criação/exclusão de usuário)
  if (item) query = query.eq('detalhes->>entidade', item)
  if (de) query = query.gte('created_at', new Date(`${de}T00:00:00`).toISOString())
  if (ate) query = query.lte('created_at', new Date(`${ate}T23:59:59`).toISOString())

  const [{ data: logs }, { data: clientes }, { data: taskLogs }, { data: perfis }] = await Promise.all([
    query,
    supabase.from('clientes').select('id, nome').order('nome'),
    // Aba "Alterações de tarefas": últimas 50 reaberturas de tarefa.
    supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50),
    // Só a cor de cada usuário, para a bolinha da coluna Usuário.
    supabase.from('profiles').select('id, cor'),
  ])

  const cores: Record<string, string> = {}
  for (const p of perfis ?? []) { if (p.cor) cores[p.id] = p.cor }

  return (
    <LogsEventosClient
      logs={logs ?? []}
      taskLogs={taskLogs ?? []}
      clientes={clientes ?? []}
      cores={cores}
      abaInicial={aba === 'tarefas' ? 'tarefas' : 'eventos'}
      filtros={{ tipo: tipo ?? '', setor: setor ?? '', clienteId: clienteId ?? '', item: item ?? '', de: de ?? '', ate: ate ?? '' }}
    />
  )
}
