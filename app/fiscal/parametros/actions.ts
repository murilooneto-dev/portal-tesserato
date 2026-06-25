'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function salvarComunicado(formData: FormData) {
  const supabase = await createClient()
  const texto = formData.get('dashboard_announcement') as string

  const { error } = await supabase
    .from('app_settings')
    .update({ dashboard_announcement: texto })
    .eq('id', 1)

  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}

export async function atualizarPerfil(id: string, formData: FormData) {
  const supabase = await createClient()

  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) throw new Error('Não autorizado.')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
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
  // Verifica que o chamador é admin
  const supabaseCheck = await createClient()
  const { data: { user: caller } } = await supabaseCheck.auth.getUser()
  if (!caller) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabaseCheck.from('profiles').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }

  const admin = createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .update(settings)
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}
