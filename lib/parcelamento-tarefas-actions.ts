'use server'

import { getAuthenticatedAdmin } from './supabase/server'

// Chamada quando o admin marca um parcelamento como CANCELADO/LIQUIDADO na
// tela de Parcelamentos. Apaga as tarefas que esse parcelamento gerou a
// partir da competência informada (inclusive) em diante — meses anteriores
// ficam intactos, como histórico. Os valores em `parcelamentos.<mes>` não
// são tocados aqui; se o status voltar pra EM ANDAMENTO, a sincronização
// reativa (sincronizarTarefasParcelamento) recria a tarefa a partir deles
// na próxima vez que a competência for visitada.
//
// Usa getAuthenticatedAdmin() (não o client de sessão) porque as tarefas
// geradas por parcelamento têm usuario_id = null, e a policy de RLS de
// `tarefas` só libera "usuario_id = auth.uid() or is_admin()" — um
// operador não-admin não conseguiria apagar essas linhas direto.
export async function removerTarefasFuturasDoParcelamento(
  parcelamentoId: string,
  mesCorte: number,
  anoCorte: number,
): Promise<{ error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('tarefas')
    .delete()
    .eq('parcelamento_id', parcelamentoId)
    .or(`ano.gt.${anoCorte},and(ano.eq.${anoCorte},mes.gte.${mesCorte})`)

  return { error: error?.message ?? null }
}
