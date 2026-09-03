'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { registrarEvento, registrarEdicao, camposAlterados, abrirHistoricoResponsavel } from '@/lib/logs'
import type { UserSetor } from '@/lib/types'

interface ClientePayload {
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
  mit: string | null
  contato_chat: string | null
  setores: UserSetor[]
  tarefas_vinculadas_ativas: string[]
}

interface FiscalPayload {
  cod: string | null
  regime: string | null
  atividade: string[]
  responsavel: string | null
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  faz_dossie: boolean
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  tarefas_personalizadas: string[]
  tarefas_excluidas: string[]
}

// Mesma lógica de provisionamento condicional que já vivia no client-side
// de ClienteGeralModal.tsx: cada setor marcado ganha (se ainda não tiver)
// uma linha na tabela filha correspondente; desmarcado, perde a linha. O
// bloco Fiscal fica somente-leitura na edição (edição de verdade é feita em
// /fiscal/clientes) — aqui só provisiona se a linha ainda não existir.
export async function salvarClienteGeral(
  clienteId: string | null,
  clientePayload: ClientePayload,
  fiscalPayload: FiscalPayload,
): Promise<{ error?: string; id?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { data: usuarioProfile } = await supabase.from('profiles').select('nome').eq('id', user.id).single()
  const usuarioNome = usuarioProfile?.nome ?? 'Desconhecido'

  const setoresEfetivos = clientePayload.setores

  if (clienteId) {
    const { data: clienteAntes } = await supabase.from('clientes')
      .select('nome, cnpj, municipio, uf, contato_chat, setores').eq('id', clienteId).single()

    const { error } = await supabase.from('clientes').update(clientePayload).eq('id', clienteId)
    if (error) return { error: error.message }

    const campos = camposAlterados(clienteAntes, {
      nome: clientePayload.nome, cnpj: clientePayload.cnpj, municipio: clientePayload.municipio,
      uf: clientePayload.uf, contato_chat: clientePayload.contato_chat, setores: clientePayload.setores,
    })
    await registrarEdicao(supabase, {
      setor: null, clienteId, clienteNome: clientePayload.nome,
      usuarioId: user.id, usuarioNome, campos,
    })

    if (setoresEfetivos.includes('fiscal')) {
      const { data: existente } = await supabase.from('clientes_fiscal').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
      if (!existente) {
        const { error: errFiscal } = await supabase.from('clientes_fiscal').insert({ cliente_id: clienteId, ...fiscalPayload })
        if (errFiscal) return { error: errFiscal.message }
        if (fiscalPayload.responsavel) {
          await abrirHistoricoResponsavel(supabase, {
            clienteId, setor: 'fiscal', responsavel: fiscalPayload.responsavel, usuarioId: user.id, usuarioNome,
          })
        }
      }
    } else {
      const { error: errRemoveFiscal } = await supabase.from('clientes_fiscal').delete().eq('cliente_id', clienteId)
      if (errRemoveFiscal) return { error: errRemoveFiscal.message }
    }

    if (setoresEfetivos.includes('contabil')) {
      const { data: existenteContabil } = await supabase.from('clientes_contabil').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
      if (!existenteContabil) {
        const { data: tiposContabil } = await supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').eq('padrao', true).order('nome')
        const { error: errContabil } = await supabase.from('clientes_contabil').insert({
          cliente_id: clienteId,
          tarefas_personalizadas: (tiposContabil ?? []).map(t => t.nome),
        })
        if (errContabil) return { error: errContabil.message }
      }
    } else {
      const { error: errRemoveContabil } = await supabase.from('clientes_contabil').delete().eq('cliente_id', clienteId)
      if (errRemoveContabil) return { error: errRemoveContabil.message }
    }

    if (setoresEfetivos.includes('pessoal')) {
      const { data: existentePessoal } = await supabase.from('clientes_pessoal').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
      if (!existentePessoal) {
        const { data: tiposPessoal } = await supabase.from('tarefa_tipos').select('nome').eq('setor', 'pessoal').eq('padrao', true).order('nome')
        const { error: errPessoal } = await supabase.from('clientes_pessoal').insert({
          cliente_id: clienteId,
          tarefas_personalizadas: (tiposPessoal ?? []).map(t => t.nome),
        })
        if (errPessoal) return { error: errPessoal.message }
      }
    } else {
      const { error: errRemovePessoal } = await supabase.from('clientes_pessoal').delete().eq('cliente_id', clienteId)
      if (errRemovePessoal) return { error: errRemovePessoal.message }
    }
  } else {
    const { data: novoCliente, error: errCliente } = await supabase.from('clientes').insert(clientePayload).select('id').single()
    if (errCliente || !novoCliente) return { error: errCliente?.message ?? 'Falha ao criar cliente' }
    const novoId: string = novoCliente.id
    clienteId = novoId

    if (setoresEfetivos.includes('fiscal')) {
      const { error: errFiscal } = await supabase.from('clientes_fiscal').insert({ cliente_id: novoId, ...fiscalPayload })
      if (errFiscal) return { error: errFiscal.message }
      if (fiscalPayload.responsavel) {
        await abrirHistoricoResponsavel(supabase, {
          clienteId: novoId, setor: 'fiscal', responsavel: fiscalPayload.responsavel, usuarioId: user.id, usuarioNome,
        })
      }
    }
    if (setoresEfetivos.includes('contabil')) {
      const { data: tiposContabil } = await supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').eq('padrao', true).order('nome')
      const { error: errContabil } = await supabase.from('clientes_contabil').insert({
        cliente_id: novoId,
        tarefas_personalizadas: (tiposContabil ?? []).map(t => t.nome),
      })
      if (errContabil) return { error: errContabil.message }
    }
    if (setoresEfetivos.includes('pessoal')) {
      const { data: tiposPessoal } = await supabase.from('tarefa_tipos').select('nome').eq('setor', 'pessoal').eq('padrao', true).order('nome')
      const { error: errPessoal } = await supabase.from('clientes_pessoal').insert({
        cliente_id: novoId,
        tarefas_personalizadas: (tiposPessoal ?? []).map(t => t.nome),
      })
      if (errPessoal) return { error: errPessoal.message }
    }

    await registrarEvento(supabase, {
      setor: null, clienteId: novoId, clienteNome: clientePayload.nome,
      tipoEvento: 'criacao', usuarioId: user.id, usuarioNome,
    })
  }

  revalidatePath('/clientes')
  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/contabil/clientes')
  revalidatePath('/pessoal/clientes')
  return { id: clienteId ?? undefined }
}

// Diferente de excluirCliente (app/fiscal/clientes/actions.ts), que também
// libera o responsável do cliente via podeEditarCliente() — aqui, na tela
// geral COMUM que lista clientes de todos os setores, só admin pode
// excluir. `clientes` tem on delete cascade pras linhas de
// clientes_fiscal/contabil/pessoal e tudo que referencia o cliente
// (tarefas, parcelamentos, arquivos, tarefas_avulsas etc.) — excluir aqui
// remove o cliente do sistema inteiro, não só de um setor.
export async function excluirClienteGeral(id: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' }

  const { data: callerProfile } = await supabase.from('profiles').select('role,nome').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { data: cliente } = await supabase.from('clientes').select('nome').eq('id', id).single()

  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) return { error: error.message }

  await registrarEvento(supabase, {
    setor: null, clienteId: null, clienteNome: cliente?.nome ?? '—',
    tipoEvento: 'exclusao', usuarioId: user.id, usuarioNome: callerProfile?.nome ?? 'Desconhecido',
  })

  revalidatePath('/clientes')
  return { error: null }
}
