// lib/remover-cliente-do-setor.ts
//
// "Excluir" de Contábil e Pessoal: tira o cliente do setor e, se ele não
// estiver em mais nenhum, apaga o cliente do sistema. Lógica única para as
// duas Server Actions, com o client Supabase injetado (testável com um
// client falso).
//
// Diferente da versão anterior, nunca ignora erro do banco. E, quando vai
// apagar o cliente inteiro, apaga PRIMEIRO a linha de clientes: a cascata leva
// tarefas e fichas dos setores, e se o banco recusar (ex.: procedimentos do
// Societário referenciando o cliente) nada foi apagado.

import type { UserSetor } from './types'
import { planejarExclusaoNoSetor, mensagemErroExclusao } from './exclusao-cliente'

interface Filtravel extends PromiseLike<{ error: { message: string } | null }> {
  eq(coluna: string, valor: unknown): Filtravel
}

export interface ClienteSupabaseMinimo {
  from(tabela: string): {
    delete(): Filtravel
    update(valores: Record<string, unknown>): Filtravel
  }
}

export interface ResultadoRemocaoDoSetor {
  error: string | null
  clienteRemovidoDoTodo: boolean
}

const TABELA_FICHA_DO_SETOR: Partial<Record<UserSetor, string>> = {
  contabil: 'clientes_contabil',
  pessoal: 'clientes_pessoal',
}

export async function removerClienteDoSetor(
  supabase: ClienteSupabaseMinimo,
  input: { clienteId: string; setor: UserSetor; setoresAtuais: UserSetor[] },
): Promise<ResultadoRemocaoDoSetor> {
  const { clienteId, setor, setoresAtuais } = input
  const plano = planejarExclusaoNoSetor(setoresAtuais, setor)

  if (plano.removeCliente) {
    const { error } = await supabase.from('clientes').delete().eq('id', clienteId)
    if (error) return { error: mensagemErroExclusao(error.message), clienteRemovidoDoTodo: false }
    return { error: null, clienteRemovidoDoTodo: true }
  }

  const tarefas = await supabase.from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', setor)
  if (tarefas.error) return { error: mensagemErroExclusao(tarefas.error.message), clienteRemovidoDoTodo: false }

  const tabelaFicha = TABELA_FICHA_DO_SETOR[setor]
  if (tabelaFicha) {
    const ficha = await supabase.from(tabelaFicha).delete().eq('cliente_id', clienteId)
    if (ficha.error) return { error: mensagemErroExclusao(ficha.error.message), clienteRemovidoDoTodo: false }
  }

  const atualizacao = await supabase.from('clientes').update({ setores: plano.novosSetores }).eq('id', clienteId)
  if (atualizacao.error) return { error: mensagemErroExclusao(atualizacao.error.message), clienteRemovidoDoTodo: false }

  return { error: null, clienteRemovidoDoTodo: false }
}
