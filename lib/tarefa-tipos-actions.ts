'use server'

import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor, TipoResposta } from './types'

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
  padrao: boolean = false,
): Promise<{ error: string | null }> {
  const nomeTrim = nome.trim()
  if (setor === 'fiscal' && NOMES_RESERVADOS_FISCAL.includes(nomeTrim)) {
    return { error: 'Esse nome é reservado pelo sistema (usado pelas etapas fixas de Entrada/Saídas) e não pode virar um tipo de tarefa.' }
  }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  // Por padrão (chamado a partir do cadastro de um cliente específico via
  // NovoTipoTarefaModal), `padrao` fica false — não deve ser copiado
  // automaticamente pra tarefas_personalizadas de outros clientes (ver
  // ClienteGeralModal.tsx, que filtra .eq('padrao', true) ao provisionar
  // cliente novo). Fica disponível no catálogo pra reuso manual, mas não se
  // impõe sozinho. O catálogo global de admin (app/admin/configuracoes)
  // passa padrao=true explicitamente, pois lá a expectativa é justamente
  // criar um tipo padrão.
  const { error } = await supabase.from('tarefa_tipos').insert({
    setor,
    nome: nomeTrim,
    tipo_resposta: tipoResposta,
    etapas,
    padrao,
  })

  if (error) {
    // unique(setor, nome): outra pessoa criou esse tipo nesse meio tempo —
    // tratado como sucesso, é exatamente o resultado que queríamos.
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}
