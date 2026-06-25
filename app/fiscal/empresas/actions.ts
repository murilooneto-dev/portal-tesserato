'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function criarEmpresa(formData: FormData) {
  const supabase = await createClient()

  const tarefasRaw = formData.get('tarefas_personalizadas') as string | null
  const tarefas = tarefasRaw ? JSON.parse(tarefasRaw) : []

  const enviaSS = formData.get('envia_iss') === 'on'

  const { error } = await supabase.from('clientes').insert({
    cod:                   formData.get('cod')          || null,
    nome:                  formData.get('nome')         as string,
    cnpj:                  formData.get('cnpj')         || null,
    regime:                formData.get('regime')       || null,
    grupo:                 formData.get('grupo')        || null,
    atividade:             formData.get('atividade')    || null,
    mit:                   (() => {
      const mun = formData.get('municipio') as string | null
      const uf  = formData.get('uf')        as string | null
      if (mun && uf) return `${mun}/${uf}`
      return mun || null
    })(),
    responsavel:           formData.get('responsavel')  || null,
    prioridade:            Number(formData.get('prioridade') || 3),
    declaracao_anual:      formData.get('declaracao_anual') === 'on',
    envia_iss:             enviaSS,
    login_iss:             enviaSS ? (formData.get('login_iss') || null) : null,
    senha_iss:             enviaSS ? (formData.get('senha_iss') || null) : null,
    email_envio_iss:       enviaSS ? (formData.get('email_envio_iss') || null) : null,
    tarefas_personalizadas: tarefas,
  })

  if (error) throw new Error(error.message)
  redirect('/fiscal/empresas')
}

export async function atualizarEmpresa(id: string, formData: FormData) {
  const supabase = await createClient()

  const tarefasRaw = formData.get('tarefas_personalizadas') as string | null
  const tarefas = tarefasRaw ? JSON.parse(tarefasRaw) : []

  const enviaSS = formData.get('envia_iss') === 'on'

  const { error } = await supabase.from('clientes').update({
    cod:                   formData.get('cod')          || null,
    nome:                  formData.get('nome')         as string,
    cnpj:                  formData.get('cnpj')         || null,
    regime:                formData.get('regime')       || null,
    grupo:                 formData.get('grupo')        || null,
    atividade:             formData.get('atividade')    || null,
    mit:                   (() => {
      const mun = formData.get('municipio') as string | null
      const uf  = formData.get('uf')        as string | null
      if (mun && uf) return `${mun}/${uf}`
      return mun || null
    })(),
    responsavel:           formData.get('responsavel')  || null,
    prioridade:            Number(formData.get('prioridade') || 3),
    declaracao_anual:      formData.get('declaracao_anual') === 'on',
    envia_iss:             enviaSS,
    login_iss:             enviaSS ? (formData.get('login_iss') || null) : null,
    senha_iss:             enviaSS ? (formData.get('senha_iss') || null) : null,
    email_envio_iss:       enviaSS ? (formData.get('email_envio_iss') || null) : null,
    tarefas_personalizadas: tarefas,
  }).eq('id', id)

  if (error) throw new Error(error.message)
  redirect('/fiscal/empresas')
}

export async function excluirEmpresa(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/empresas')
}
