'use server'

import { getAuthenticatedAdmin, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buscarTodasTarefas } from '@/lib/tarefas-paginacao'
import { createClient as createClienteDescartavel } from '@supabase/supabase-js'

function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

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

  const setores = formData.getAll('setores') as string[]
  const paginasAcesso = formData.getAll('paginas_acesso') as string[]

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: formData.get('nome') as string,
      role: formData.get('role') as string,
      cor:  formData.get('cor')  as string,
      setores: setores.length > 0 ? setores : ['fiscal'],
      paginas_acesso: paginasAcesso,
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
  paginasAcesso: string[]
  setores: string[]
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

  // A trigger handle_new_user() já criou a linha em profiles (com valores
  // padrão) como parte da mesma transação do createUser acima — por isso
  // aqui é update, não insert.
  const { error: profErr } = await admin.from('profiles').update({
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setores: payload.setores.length > 0 ? payload.setores : ['fiscal'],
    paginas_acesso: payload.paginasAcesso,
  }).eq('id', userId)

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
): Promise<{ error?: string; atualizados: number; avisoForaCatalogo: string[] }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0, avisoForaCatalogo: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0, avisoForaCatalogo: [] }

  const { data: templateRow, error: templateErr } = await supabase
    .from('atividade_templates')
    .select('tarefas')
    .eq('atividade', atividadeBase)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0, avisoForaCatalogo: [] }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0, avisoForaCatalogo: [] }

  const { data: tiposCatalogo } = await supabase
    .from('tarefa_tipos')
    .select('nome')
    .eq('setor', 'fiscal')
  const nomesCatalogoNormalizados = new Set((tiposCatalogo ?? []).map(t => normalizarNome(t.nome as string)))
  const avisoForaCatalogo = tarefasBase.filter(t => !nomesCatalogoNormalizados.has(normalizarNome(t)))

  const { data: clientes } = await supabase
    .from('clientes_fiscal')
    .select('cliente_id, atividade, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (!c.atividade?.includes(atividadeBase)) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes_fiscal')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('cliente_id', c.cliente_id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
}

export async function salvarTemplateGrupo(
  grupo: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('grupo_templates')
    .upsert({ grupo, tarefas }, { onConflict: 'grupo' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateGrupoAClientes(
  grupo: string
): Promise<{ error?: string; atualizados: number; avisoForaCatalogo: string[] }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0, avisoForaCatalogo: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0, avisoForaCatalogo: [] }

  const { data: templateRow, error: templateErr } = await supabase
    .from('grupo_templates')
    .select('tarefas')
    .eq('grupo', grupo)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0, avisoForaCatalogo: [] }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0, avisoForaCatalogo: [] }

  const { data: tiposCatalogo } = await supabase
    .from('tarefa_tipos')
    .select('nome')
    .eq('setor', 'fiscal')
  const nomesCatalogoNormalizados = new Set((tiposCatalogo ?? []).map(t => normalizarNome(t.nome as string)))
  const avisoForaCatalogo = tarefasBase.filter(t => !nomesCatalogoNormalizados.has(normalizarNome(t)))

  const { data: clientes } = await supabase
    .from('clientes_fiscal')
    .select('cliente_id, grupo, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (c.grupo !== grupo) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes_fiscal')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('cliente_id', c.cliente_id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
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

  const { data: rows, error } = await supabase.from('clientes').select('id, nome, clientes_fiscal!inner(tarefas_personalizadas)')
  if (error) return { error: error.message, todasTarefas: [], clientes: [] }

  const todasSet = new Set<string>()
  const clientes = (rows ?? []).map(c => {
    const tarefas: string[] = (c.clientes_fiscal as unknown as { tarefas_personalizadas: string[] })?.tarefas_personalizadas ?? []
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

  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas').in('cliente_id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaOrigem)) continue
    const renamed = original.map(t => t === tarefaOrigem ? destino : t)
    // Se destino já existia na lista, remove a duplicata gerada pelo rename
    const seen = new Set<string>()
    const deduped = renamed.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: deduped }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  // Corrige registros na tabela tarefas
  const { data: registros } = await supabase
    .from('tarefas')
    .select('id')
    .eq('tipo', tarefaOrigem)
    .eq('setor', 'fiscal')
    .in('cliente_id', clienteIds)

  let tarefasCorrigidas = 0
  if ((registros ?? []).length > 0) {
    await supabase
      .from('tarefas')
      .update({ tipo: destino })
      .eq('tipo', tarefaOrigem)
      .eq('setor', 'fiscal')
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

  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas').in('cliente_id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaTipo)) continue
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: original.filter(t => t !== tarefaTipo) }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase.from('tarefas').select('id').eq('tipo', tarefaTipo).eq('setor', 'fiscal').in('cliente_id', clienteIds)
  let registrosExcluidos = 0
  if ((registros ?? []).length > 0) {
    await supabase.from('tarefas').delete().eq('tipo', tarefaTipo).eq('setor', 'fiscal').in('cliente_id', clienteIds)
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
      { tipo: tarefaTipo, cliente_id: clienteId, mes, ano, setor: 'fiscal', concluida: true, concluida_em: dataISO },
      { onConflict: 'tipo,cliente_id,mes,ano,setor' }
    )
    registrosAtualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { registrosAtualizados }
}

export async function buscarConclusoesTarefa(
  tarefaTipo: string,
  mes: number,
  ano: number
): Promise<{ error?: string; clienteIdsConcluidos: string[] }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', clienteIdsConcluidos: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', clienteIdsConcluidos: [] }

  const { data, error } = await supabase
    .from('tarefas')
    .select('cliente_id')
    .eq('tipo', tarefaTipo)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('setor', 'fiscal')
    .eq('concluida', true)

  if (error) return { error: error.message, clienteIdsConcluidos: [] }
  return { clienteIdsConcluidos: (data ?? []).map(r => r.cliente_id as string) }
}

export interface RegistroSemData {
  tipo: string
  mes: number
  ano: number
  total: number
  ids: string[]        // registros existentes com concluida_em nulo (podem ser excluídos)
  clientes: string[]   // todos os clientes sem conclusão (com ou sem registro)
  semRegistro: number  // clientes que não têm nenhum registro em tarefas para esse mês/ano
}

export async function buscarTarefasSemData(mes?: number, ano?: number): Promise<{
  error?: string
  registros: RegistroSemData[]
  totalRegistros: number
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', registros: [], totalRegistros: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', registros: [], totalRegistros: 0 }

  const mesEfetivo = mes ?? new Date().getMonth() + 1
  const anoEfetivo = ano ?? new Date().getFullYear()

  // 1. Todos os clientes com suas listas de tarefas
  const { data: clientesRowsRaw, error: errClientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(tarefas_personalizadas)')
    .order('nome')
  if (errClientes) return { error: errClientes.message, registros: [], totalRegistros: 0 }
  const clientesRows = (clientesRowsRaw ?? []).map(c => ({
    id: c.id, nome: c.nome,
    tarefas_personalizadas: (c.clientes_fiscal as unknown as { tarefas_personalizadas: string[] })?.tarefas_personalizadas ?? [],
  }))

  // 2. Todos os registros em tarefas para o mês/ano selecionado
  const { data: tarefasRows, error: errTarefas } = await supabase
    .from('tarefas')
    .select('id, tipo, cliente_id, concluida_em')
    .eq('mes', mesEfetivo)
    .eq('ano', anoEfetivo)
    .eq('setor', 'fiscal')
  if (errTarefas) return { error: errTarefas.message, registros: [], totalRegistros: 0 }

  // Mapas de lookup por clienteId||tipo
  const completedKeys = new Set<string>()
  const semDataMap = new Map<string, string>() // clienteId||tipo → id do registro

  for (const t of tarefasRows ?? []) {
    const key = `${t.cliente_id}||${t.tipo}`
    if (t.concluida_em !== null) {
      completedKeys.add(key)
    } else {
      semDataMap.set(key, t.id)
    }
  }

  // Cruzamento: para cada cliente × tarefa, achar os incompletos
  const grupos: Record<string, RegistroSemData> = {}

  for (const cliente of clientesRows ?? []) {
    for (const tipo of (cliente.tarefas_personalizadas ?? [])) {
      const key = `${cliente.id}||${tipo}`
      if (completedKeys.has(key)) continue // já concluída, pula

      if (!grupos[tipo]) {
        grupos[tipo] = { tipo, mes: mesEfetivo, ano: anoEfetivo, total: 0, ids: [], clientes: [], semRegistro: 0 }
      }

      grupos[tipo].total++
      grupos[tipo].clientes.push(cliente.nome)

      const recordId = semDataMap.get(key)
      if (recordId) {
        grupos[tipo].ids.push(recordId)
      } else {
        grupos[tipo].semRegistro++
      }
    }
  }

  const registros = Object.values(grupos).sort((a, b) => a.tipo.localeCompare(b.tipo))
  const totalRegistros = registros.reduce((sum, r) => sum + r.total, 0)

  return { registros, totalRegistros }
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

  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas')

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
      if (versoes.length > 1) gruposMap[key].afetados.add(c.cliente_id)
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

  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas')
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
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: deduped }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  // Corrige registros na tabela tarefas — busca todas as linhas uma única vez (paginado,
  // pois o Supabase limita cada requisição a um máximo de linhas) e corrige em memória
  const todosRegistros = await buscarTodasTarefas<{ id: string; tipo: string }>(supabase, 'id, tipo', 'fiscal')

  let tarefasCorrigidas = 0
  for (const [normalizado, canonico] of Object.entries(mapeamento)) {
    for (const r of todosRegistros) {
      if (r.tipo !== canonico && semAcento(r.tipo) === normalizado) {
        await supabase.from('tarefas').update({ tipo: canonico }).eq('id', r.id)
        tarefasCorrigidas++
      }
    }
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/parametros')
  return { clientesAtualizados, tarefasCorrigidas }
}

const CAMPOS_MESCLAVEIS_PARCELAMENTO = [
  'regime', 'responsavel', 'local_tipo', 'tarefa', 'senhas',
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

function chaveParcelamento(r: { empresa: string | null; cnpj: string | null; secao: string | null }): string {
  return `${(r.empresa ?? '').trim().toUpperCase()}|${r.cnpj ?? ''}|${r.secao ?? ''}`
}

export interface GrupoParcelamentoDuplicado {
  chave: string
  empresa: string
  cnpj: string | null
  secao: string
  quantidade: number
}

export async function analisarParcelamentosDuplicados(): Promise<{
  error?: string
  grupos: GrupoParcelamentoDuplicado[]
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', grupos: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', grupos: [] }

  const { data: registros, error } = await supabase
    .from('parcelamentos')
    .select('id, empresa, cnpj, secao')
  if (error) return { error: error.message, grupos: [] }

  const gruposMap: Record<string, typeof registros> = {}
  for (const r of registros ?? []) {
    const chave = chaveParcelamento(r)
    if (!gruposMap[chave]) gruposMap[chave] = []
    gruposMap[chave]!.push(r)
  }

  const grupos: GrupoParcelamentoDuplicado[] = Object.entries(gruposMap)
    .filter(([, rows]) => (rows ?? []).length > 1)
    .map(([chave, rows]) => ({
      chave,
      empresa: rows![0].empresa,
      cnpj: rows![0].cnpj,
      secao: rows![0].secao,
      quantidade: rows!.length,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  return { grupos }
}

export async function limparParcelamentosDuplicados(): Promise<{
  error?: string
  gruposMesclados: number
  linhasRemovidas: number
}> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', gruposMesclados: 0, linhasRemovidas: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', gruposMesclados: 0, linhasRemovidas: 0 }

  const { data: registros, error } = await supabase.from('parcelamentos').select('*')
  if (error) return { error: error.message, gruposMesclados: 0, linhasRemovidas: 0 }

  const gruposMap: Record<string, typeof registros> = {}
  for (const r of registros ?? []) {
    const chave = chaveParcelamento(r)
    if (!gruposMap[chave]) gruposMap[chave] = []
    gruposMap[chave]!.push(r)
  }

  let gruposMesclados = 0
  let linhasRemovidas = 0

  for (const rows of Object.values(gruposMap)) {
    if (!rows || rows.length < 2) continue
    const [base, ...outros] = rows

    const mesclado: Record<string, unknown> = {}
    for (const campo of CAMPOS_MESCLAVEIS_PARCELAMENTO) {
      let valor = (base as Record<string, unknown>)[campo]
      if (!valor) {
        for (const o of outros) {
          const vOutro = (o as Record<string, unknown>)[campo]
          if (vOutro) { valor = vOutro; break }
        }
      }
      mesclado[campo] = valor ?? null
    }

    const mudou = CAMPOS_MESCLAVEIS_PARCELAMENTO.some(c => mesclado[c] !== (base as Record<string, unknown>)[c])
    if (mudou) {
      await supabase.from('parcelamentos').update(mesclado).eq('id', base.id)
    }

    const idsRemover = outros.map(o => o.id)
    await supabase.from('parcelamentos').delete().in('id', idsRemover)
    linhasRemovidas += idsRemover.length
    gruposMesclados++
  }

  revalidatePath('/fiscal/parcelamentos')
  revalidatePath('/fiscal/parametros')
  return { gruposMesclados, linhasRemovidas }
}

export async function verificarSenhaDev(
  login: string,
  senha: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { ok: false, error: 'Não autorizado.' }

  const devEmail = process.env.DEV_MASTER_EMAIL
  if (!devEmail) return { ok: false, error: 'DEV_MASTER_EMAIL não configurada no servidor.' }

  if (login.trim().toLowerCase() !== devEmail.trim().toLowerCase()) {
    return { ok: false, error: 'Credenciais inválidas.' }
  }

  const clienteDescartavel = createClienteDescartavel(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await clienteDescartavel.auth.signInWithPassword({ email: login, password: senha })
  if (error) return { ok: false, error: 'Credenciais inválidas.' }

  return { ok: true }
}
