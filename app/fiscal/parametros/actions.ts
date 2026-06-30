'use server'

import { getAuthenticatedAdmin, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarComunicado(formData: FormData) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const texto = formData.get('dashboard_announcement') as string
  const { error } = await supabase.from('app_settings').update({ dashboard_announcement: texto }).eq('id', 1)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}

export async function atualizarPerfil(id: string, formData: FormData) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) throw new Error('Não autorizado.')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') throw new Error('Acesso negado.')

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: formData.get('nome') as string,
      role: formData.get('role') as string,
      cor:  formData.get('cor')  as string,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}

export async function criarUsuario(payload: {
  nome: string
  login: string
  senha: string
  role: string
  cor: string
  abas: string[]
}): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: payload.login,
    password: payload.senha,
    email_confirm: true,
  })
  if (authErr) return { error: authErr.message }

  const userId = authData.user.id

  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setor: 'fiscal',
    abas_acesso: payload.abas,
  })

  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { error: profErr.message }
  }

  revalidatePath('/fiscal/parametros')
  return {}
}

export async function salvarConfiguracoes(settings: Record<string, unknown>): Promise<{ error?: string }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }
  const { error } = await supabase.from('app_settings').update(settings).eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function salvarTemplate(
  atividade: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('atividade_templates')
    .upsert({ atividade, tarefas }, { onConflict: 'atividade' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateAClientes(
  atividadeBase: string
): Promise<{ error?: string; atualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0 }

  const { data: templateRow, error: templateErr } = await supabase
    .from('atividade_templates')
    .select('tarefas')
    .eq('atividade', atividadeBase)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0 }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0 }

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, atividade, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (!c.atividade?.includes(atividadeBase)) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('id', c.id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados }
}

export async function buscarDadosParaAlteracao(): Promise<{
  error?: string
  todasTarefas: string[]
  clientes: { id: string; nome: string; tarefas: string[] }[]
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', todasTarefas: [], clientes: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', todasTarefas: [], clientes: [] }

  const { data: rows, error } = await supabase.from('clientes').select('id, nome, tarefas_personalizadas')
  if (error) return { error: error.message, todasTarefas: [], clientes: [] }

  const todasSet = new Set<string>()
  const clientes = (rows ?? []).map(c => {
    const tarefas: string[] = c.tarefas_personalizadas ?? []
    for (const t of tarefas) todasSet.add(t)
    return { id: c.id as string, nome: c.nome as string, tarefas }
  })

  return { todasTarefas: Array.from(todasSet).sort(), clientes }
}

export async function renomearTarefaEmClientes(
  tarefaOrigem: string,
  tarefaDestino: string,
  clienteIds: string[]
): Promise<{ error?: string; clientesAtualizados: number; tarefasCorrigidas: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', clientesAtualizados: 0, tarefasCorrigidas: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', clientesAtualizados: 0, tarefasCorrigidas: 0 }

  const destino = tarefaDestino.trim()
  if (!destino) return { error: 'Nome de destino não pode ser vazio.', clientesAtualizados: 0, tarefasCorrigidas: 0 }
  if (clienteIds.length === 0) return { error: 'Nenhum cliente selecionado.', clientesAtualizados: 0, tarefasCorrigidas: 0 }

  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas').in('id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaOrigem)) continue
    const renamed = original.map(t => t === tarefaOrigem ? destino : t)
    // Se destino já existia na lista, remove a duplicata gerada pelo rename
    const seen = new Set<string>()
    const deduped = renamed.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
    await supabase.from('clientes').update({ tarefas_personalizadas: deduped }).eq('id', c.id)
    clientesAtualizados++
  }

  // Corrige registros na tabela tarefas
  const { data: registros } = await supabase
    .from('tarefas')
    .select('id')
    .eq('tipo', tarefaOrigem)
    .in('cliente_id', clienteIds)

  let tarefasCorrigidas = 0
  if ((registros ?? []).length > 0) {
    await supabase
      .from('tarefas')
      .update({ tipo: destino })
      .eq('tipo', tarefaOrigem)
      .in('cliente_id', clienteIds)
    tarefasCorrigidas = registros!.length
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/parametros')
  return { clientesAtualizados, tarefasCorrigidas }
}

export async function excluirTarefaDeClientes(
  tarefaTipo: string,
  clienteIds: string[]
): Promise<{ error?: string; clientesAtualizados: number; registrosExcluidos: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', clientesAtualizados: 0, registrosExcluidos: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', clientesAtualizados: 0, registrosExcluidos: 0 }
  if (clienteIds.length === 0) return { error: 'Nenhum cliente selecionado.', clientesAtualizados: 0, registrosExcluidos: 0 }

  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas').in('id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaTipo)) continue
    await supabase.from('clientes').update({ tarefas_personalizadas: original.filter(t => t !== tarefaTipo) }).eq('id', c.id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase.from('tarefas').select('id').eq('tipo', tarefaTipo).in('cliente_id', clienteIds)
  let registrosExcluidos = 0
  if ((registros ?? []).length > 0) {
    await supabase.from('tarefas').delete().eq('tipo', tarefaTipo).in('cliente_id', clienteIds)
    registrosExcluidos = registros!.length
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/parametros')
  return { clientesAtualizados, registrosExcluidos }
}

export async function preencherDataEmClientes(
  tarefaTipo: string,
  mes: number,
  ano: number,
  dataISO: string,
  clienteIds: string[]
): Promise<{ error?: string; registrosAtualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', registrosAtualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', registrosAtualizados: 0 }
  if (clienteIds.length === 0) return { error: 'Nenhum cliente selecionado.', registrosAtualizados: 0 }

  let registrosAtualizados = 0
  for (const clienteId of clienteIds) {
    await supabase.from('tarefas').upsert(
      { tipo: tarefaTipo, cliente_id: clienteId, mes, ano, concluida: true, concluida_em: dataISO },
      { onConflict: 'tipo,cliente_id,mes,ano' }
    )
    registrosAtualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { registrosAtualizados }
}

export interface RegistroSemData {
  tipo: string
  mes: number
  ano: number
  total: number
  ids: string[]
  clientes: string[]  // nomes dos clientes afetados
}

export async function buscarTarefasSemData(mes?: number): Promise<{
  error?: string
  registros: RegistroSemData[]
  totalRegistros: number
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', registros: [], totalRegistros: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', registros: [], totalRegistros: 0 }

  let query = supabase
    .from('tarefas')
    .select('id, tipo, mes, ano, cliente_id, clientes(nome)')
    .is('concluida_em', null)
    .order('tipo')
    .order('ano')
    .order('mes')

  if (mes !== undefined) query = query.eq('mes', mes)

  const { data: rows, error } = await query

  if (error) return { error: error.message, registros: [], totalRegistros: 0 }

  // Agrupa por tipo+mes+ano
  const grupos: Record<string, RegistroSemData> = {}
  for (const r of rows ?? []) {
    const key = `${r.tipo}||${r.mes}||${r.ano}`
    const clienteJoin = r.clientes as unknown as { nome: string } | { nome: string }[] | null
    const nomeCliente = Array.isArray(clienteJoin) ? (clienteJoin[0]?.nome ?? r.cliente_id) : (clienteJoin?.nome ?? r.cliente_id)
    if (!grupos[key]) {
      grupos[key] = { tipo: r.tipo, mes: r.mes, ano: r.ano, total: 0, ids: [], clientes: [] }
    }
    grupos[key].total++
    grupos[key].ids.push(r.id)
    grupos[key].clientes.push(nomeCliente)
  }

  const registros = Object.values(grupos).sort((a, b) =>
    a.tipo.localeCompare(b.tipo) || a.ano - b.ano || a.mes - b.mes
  )

  return { registros, totalRegistros: (rows ?? []).length }
}

export async function excluirRegistrosDeTarefas(
  ids: string[]
): Promise<{ error?: string; excluidos: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', excluidos: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', excluidos: 0 }
  if (ids.length === 0) return { error: 'Nenhum registro selecionado.', excluidos: 0 }

  const { error } = await supabase.from('tarefas').delete().in('id', ids)
  if (error) return { error: error.message, excluidos: 0 }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/parametros')
  return { excluidos: ids.length }
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export interface GrupoDuplicata {
  normalizado: string     // chave sem acento (ex: "SAIDAS")
  versoes: string[]       // todas as variantes encontradas (ex: ["SAIDAS", "SAÍDAS"])
  sugerido: string | null // auto-sugerido: a versão com acento, se houver exatamente uma
  clientesAfetados: number
}

export async function analisarTarefasDuplicadas(): Promise<{
  error?: string
  grupos: GrupoDuplicata[]
  todasTarefas: string[]  // lista de todas as tarefas únicas (para seleção manual)
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', grupos: [], todasTarefas: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', grupos: [], todasTarefas: [] }

  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas')

  const gruposMap: Record<string, { versoes: Set<string>; afetados: Set<string> }> = {}
  const todasSet = new Set<string>()

  for (const c of clientes ?? []) {
    const tarefas: string[] = c.tarefas_personalizadas ?? []
    const vistasNessaCliente: Record<string, string[]> = {}

    for (const t of tarefas) {
      todasSet.add(t)
      const key = semAcento(t)
      if (!gruposMap[key]) gruposMap[key] = { versoes: new Set(), afetados: new Set() }
      gruposMap[key].versoes.add(t)
      if (!vistasNessaCliente[key]) vistasNessaCliente[key] = []
      vistasNessaCliente[key].push(t)
    }
    // Marca clientes que têm 2+ variantes da mesma tarefa
    for (const [key, versoes] of Object.entries(vistasNessaCliente)) {
      if (versoes.length > 1) gruposMap[key].afetados.add(c.id)
    }
  }

  const grupos: GrupoDuplicata[] = []
  for (const [normalizado, { versoes, afetados }] of Object.entries(gruposMap)) {
    if (versoes.size < 2) continue
    const versoesArr = Array.from(versoes).sort()
    const comAcento = versoesArr.filter(v => semAcento(v) !== v)
    const sugerido = comAcento.length === 1 ? comAcento[0] : null
    grupos.push({ normalizado, versoes: versoesArr, sugerido, clientesAfetados: afetados.size })
  }

  return {
    grupos: grupos.sort((a, b) => b.clientesAfetados - a.clientesAfetados),
    todasTarefas: Array.from(todasSet).sort(),
  }
}

// mapeamento: { [normalizado]: canonico } — ex: { "SAIDAS": "SAÍDAS" }
export async function limparTarefasDuplicadas(
  mapeamento: Record<string, string>
): Promise<{ error?: string; clientesAtualizados: number; tarefasCorrigidas: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', clientesAtualizados: 0, tarefasCorrigidas: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', clientesAtualizados: 0, tarefasCorrigidas: 0 }

  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas')
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (original.length === 0) continue
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const t of original) {
      const key = semAcento(t)
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(mapeamento[key] ?? t)
      }
    }
    const mudou = deduped.length !== original.length || deduped.some((t, i) => t !== original[i])
    if (!mudou) continue
    await supabase.from('clientes').update({ tarefas_personalizadas: deduped }).eq('id', c.id)
    clientesAtualizados++
  }

  // Corrige registros na tabela tarefas
  let tarefasCorrigidas = 0
  for (const [normalizado, canonico] of Object.entries(mapeamento)) {
    const { data: registros } = await supabase.from('tarefas').select('id, tipo').neq('tipo', canonico)
    for (const r of registros ?? []) {
      if (semAcento(r.tipo) === normalizado) {
        await supabase.from('tarefas').update({ tipo: canonico }).eq('id', r.id)
        tarefasCorrigidas++
      }
    }
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/parametros')
  return { clientesAtualizados, tarefasCorrigidas }
}
