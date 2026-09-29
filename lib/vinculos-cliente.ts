// lib/vinculos-cliente.ts
//
// Decide qual client Supabase lê as tarefas do setor de ORIGEM de um vínculo.
//
// Os selos "Aguardando/Liberada" comparam a tarefa do setor de destino (do
// usuário) com a tarefa de origem, que é de OUTRO setor. Com a RLS por setor
// em `tarefas`, o client de sessão de um usuário de setor único não enxerga
// as tarefas do outro setor e o selo ficaria "Aguardando" para sempre, sem
// erro nenhum. Por isso essa leitura específica usa o client de serviço,
// sempre pedindo só colunas de status (cliente_id, tipo, concluida) — nunca
// respostas, datas ou texto da tarefa de origem.
//
// Função pura (sem next/headers) para poder ser testada com node:test; a
// montagem real dos clients fica em lib/supabase/server.ts.

export function escolherClienteLeituraVinculos<T>(opts: {
  temUsuario: boolean
  temChaveServico: boolean
  sessao: T
  criarServico: () => T
}): T {
  // Sem usuário autenticado ou sem a chave de serviço, cai para o client de
  // sessão (comportamento anterior): nunca usa service role para anônimo.
  if (opts.temUsuario && opts.temChaveServico) return opts.criarServico()
  return opts.sessao
}
