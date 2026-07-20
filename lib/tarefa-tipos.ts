// lib/tarefa-tipos.ts

import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor, TipoResposta } from './types'

// `meses_visiveis` null/vazio = tarefa sempre visível (comportamento atual
// de todo o catálogo existente, Fiscal e Contábil não mudam). Quando
// preenchido, a tarefa só é considerada visível nos meses listados —
// usado hoje só pelo 13º Salário do Pessoal (array[11,12]).
export function tarefaVisivelNoMes(mesesVisiveis: number[] | null | undefined, mes: number): boolean {
  return !mesesVisiveis || mesesVisiveis.length === 0 || mesesVisiveis.includes(mes)
}

export function filtrarTarefasVisiveis(
  tarefasPersonalizadas: string[],
  mesesVisiveisPorTipo: Record<string, number[] | null>,
  mes: number,
): string[] {
  return tarefasPersonalizadas.filter(tipo => tarefaVisivelNoMes(mesesVisiveisPorTipo[tipo], mes))
}

// Compara ignorando maiúsculas/minúsculas e espaços nas pontas, pra "NFSe"
// e " nfse " não virarem dois tipos diferentes no catálogo.
export function tarefaExisteNoCatalogo(catalogo: string[], nome: string): boolean {
  const alvo = nome.trim().toLowerCase()
  return catalogo.some(c => c.trim().toLowerCase() === alvo)
}

// ENTRADA/SAIDAS são reconhecidas por nome literal (case-sensitive) em
// components/fiscal/TarefaChecklist.tsx, antes de qualquer lookup no
// catálogo — um tipo de catálogo com esse nome exato nunca seria alcançado
// e só geraria confusão. Bloqueado aqui, na origem.
const NOMES_RESERVADOS_FISCAL = ['ENTRADA', 'SAIDAS']

export async function criarTipoTarefa(
  setor: UserSetor,
  nome: string,
  tipoResposta: TipoResposta,
  etapas: string[] | null,
): Promise<{ error: string | null }> {
  'use server'

  const nomeTrim = nome.trim()
  if (setor === 'fiscal' && NOMES_RESERVADOS_FISCAL.includes(nomeTrim)) {
    return { error: 'Esse nome é reservado pelo sistema (usado pelas etapas fixas de Entrada/Saídas) e não pode virar um tipo de tarefa.' }
  }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase.from('tarefa_tipos').insert({
    setor,
    nome: nomeTrim,
    tipo_resposta: tipoResposta,
    etapas,
  })

  if (error) {
    // unique(setor, nome): outra pessoa criou esse tipo nesse meio tempo —
    // tratado como sucesso, é exatamente o resultado que queríamos.
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}
