'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { registrarMudancaTarefas } from '@/lib/logs'

// Societário e Financeiro não têm tabela filha (clientes_societario /
// clientes_financeiro): os dados do cliente ficam só em `clientes` e as
// tarefas dele vêm do vínculo direto cliente → tipo de tarefa
// (tarefa_tipo_vinculos com entidade_tipo='cliente', migration 042).
export type SetorSimples = 'societario' | 'financeiro'

const SETORES_SIMPLES: SetorSimples[] = ['societario', 'financeiro']

interface ClientePayload {
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
  contato_chat: string | null
}

// Edição feita a partir da ficha do cliente no setor: admin ou membro do
// setor. `tarefas` é a lista final de tipos (por nome) que o cliente deve
// ter no setor; a action vincula os novos e desvincula os retirados.
export async function salvarClienteSetorSimples(
  setor: SetorSimples,
  clienteId: string,
  clientePayload: ClientePayload,
  tarefas: string[],
): Promise<{ error?: string }> {
  if (!SETORES_SIMPLES.includes(setor)) return { error: 'Setor inválido.' }
  const nome = clientePayload.nome.trim()
  if (!nome) return { error: 'Informe a razão social.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, nome').eq('id', user.id).single()
  if (profile?.role !== 'admin' && !(profile?.setores ?? []).includes(setor)) return { error: 'Acesso negado.' }

  const { error: errCliente } = await supabase.from('clientes').update({
    nome,
    cnpj: clientePayload.cnpj,
    municipio: clientePayload.municipio,
    uf: clientePayload.uf,
    contato_chat: clientePayload.contato_chat,
  }).eq('id', clienteId)
  if (errCliente) return { error: errCliente.message }

  // Só tipos ativos do setor entram na conta: um vínculo com tipo inativo
  // não aparece no formulário e por isso não é tocado aqui.
  const [{ data: tiposRaw, error: errTipos }, { data: vinculosRaw, error: errVinculos }] = await Promise.all([
    supabase.from('tarefa_tipos').select('id, nome').eq('setor', setor).eq('ativo', true),
    supabase.from('tarefa_tipo_vinculos').select('tarefa_tipo_id').eq('entidade_tipo', 'cliente').eq('entidade_id', clienteId),
  ])
  if (errTipos) return { error: errTipos.message }
  if (errVinculos) return { error: errVinculos.message }

  const tipos = (tiposRaw ?? []) as { id: string; nome: string }[]
  const nomePorId = new Map(tipos.map(t => [t.id, t.nome]))
  const desejados = new Set(tipos.filter(t => tarefas.includes(t.nome)).map(t => t.id))
  const atuais = new Set((vinculosRaw ?? []).map(v => v.tarefa_tipo_id as string).filter(id => nomePorId.has(id)))

  const adicionar = [...desejados].filter(id => !atuais.has(id))
  const remover = [...atuais].filter(id => !desejados.has(id))

  if (adicionar.length > 0) {
    // created_at fica com o default now(): vincular hoje não gera pendência
    // retroativa (ver lib/tarefas-societario-periodicidade.ts).
    const { error } = await supabase.from('tarefa_tipo_vinculos')
      .insert(adicionar.map(id => ({ tarefa_tipo_id: id, entidade_tipo: 'cliente', entidade_id: clienteId })))
    if (error && error.code !== '23505') return { error: error.message }
  }
  if (remover.length > 0) {
    const { error } = await supabase.from('tarefa_tipo_vinculos').delete()
      .eq('entidade_tipo', 'cliente').eq('entidade_id', clienteId).in('tarefa_tipo_id', remover)
    if (error) return { error: error.message }
  }

  await registrarMudancaTarefas(supabase, {
    setor, clienteId, clienteNome: nome,
    usuarioId: user.id, usuarioNome: profile?.nome ?? 'Desconhecido',
    antes: [...atuais].map(id => nomePorId.get(id)!),
    depois: [...desejados].map(id => nomePorId.get(id)!),
  })

  revalidatePath(`/${setor}/clientes/${clienteId}`)
  revalidatePath(`/${setor}/clientes`)
  revalidatePath('/clientes')
  revalidatePath('/admin/configuracoes')
  return {}
}
