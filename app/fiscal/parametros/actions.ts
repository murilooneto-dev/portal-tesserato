'use server'

import { getAuthenticatedAdmin, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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

export async function deletarUsuario(id: string): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }
  if (id === user.id) return { error: 'Você não pode excluir seu próprio usuário.' }

  const admin = createAdminClient()
  // profiles.id referencia auth.users on delete cascade — apagar o auth.user
  // já remove a linha em profiles junto.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }

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

const CAMPOS_MESCLAVEIS_PARCELAMENTO = [
  'regime', 'responsavel', 'local_tipo', 'tarefa', 'senhas',
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
  'jan_obs', 'fev_obs', 'mar_obs', 'abr_obs', 'mai_obs', 'jun_obs',
  'jul_obs', 'ago_obs', 'set_obs', 'out_obs', 'nov_obs', 'dez_obs',
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

    // Status não entra na lista genérica "primeiro valor truthy vence": um
    // parcelamento EM ANDAMENTO nunca pode ser mascarado por um duplicado
    // LIQUIDADO/CANCELADO — isso controlaria o aviso na ficha do cliente.
    const algumEmAndamento = rows.some(r => (r as { status: string }).status === 'EM ANDAMENTO')
    mesclado.status = algumEmAndamento ? 'EM ANDAMENTO' : (base as Record<string, unknown>).status

    const camposParaComparar = [...CAMPOS_MESCLAVEIS_PARCELAMENTO, 'status'] as const
    const mudou = camposParaComparar.some(c => mesclado[c] !== (base as Record<string, unknown>)[c])
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
