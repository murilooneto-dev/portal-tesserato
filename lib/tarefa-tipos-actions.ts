'use server'

import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor, TipoResposta } from './types'

// ENTRADA/SAIDAS são reconhecidas por nome literal (case-sensitive) em
// components/fiscal/TarefaChecklist.tsx, antes de qualquer lookup no
// catálogo — um tipo de catálogo com esse nome exato nunca seria alcançado
// e só geraria confusão. Bloqueado aqui, na origem.
const NOMES_RESERVADOS_FISCAL = ['ENTRADA', 'SAIDAS']

function arraysIguais(a: string[] | number[] | null, b: string[] | number[] | null): boolean {
  if (a === null || b === null) return a === b
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export async function criarTipoTarefa(
  setor: UserSetor,
  nome: string,
  tipoResposta: TipoResposta,
  etapas: string[] | null,
  padrao: boolean = false,
  mesesVisiveis: number[] | null = null,
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
    meses_visiveis: mesesVisiveis,
  })

  if (error) {
    if (error.code === '23505') {
      // unique(setor, nome): já existe um registro com esse nome. Pode ser
      // corrida (outra pessoa criou o mesmo tipo agora) ou um tipo antigo
      // que ficou no catálogo (ex.: foi removido de um cliente, o que só
      // desvincula, nunca apaga tarefa_tipos — ver EmpresaContabilModal).
      // Buscamos o registro existente para comparar: se a config já bate
      // com o que o usuário escolheu, é a corrida (sucesso silencioso). Se
      // diverge, precisamos avisar em vez de reaproveitar sem o usuário
      // saber que o formato é outro.
      const { data: existente } = await supabase
        .from('tarefa_tipos')
        .select('tipo_resposta, etapas, meses_visiveis')
        .eq('setor', setor)
        .eq('nome', nomeTrim)
        .maybeSingle()

      if (
        existente &&
        existente.tipo_resposta === tipoResposta &&
        arraysIguais(existente.etapas, etapas) &&
        arraysIguais(existente.meses_visiveis, mesesVisiveis)
      ) {
        return { error: null }
      }

      return {
        error: `Já existe um tipo de tarefa chamado "${nomeTrim}" no catálogo, com um formato diferente do que você configurou agora. Escolha outro nome, ou use "${nomeTrim}" para reaproveitar o tipo já existente.`,
      }
    }
    return { error: error.message }
  }

  return { error: null }
}
