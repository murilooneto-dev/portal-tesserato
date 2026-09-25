// Um tipo de tarefa com responsavel_id exclusivo só é visível pro dono ou
// admin — usado em toda tela que lista/conta tarefas do setor Fiscal por
// cliente, pra manter checklist, histórico de % e progresso consistentes.
export function tipoVisivelParaUsuario(
  responsavelId: string | null | undefined,
  userId: string,
  role: string | null | undefined,
): boolean {
  return role === 'admin' || !responsavelId || responsavelId === userId
}

function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().toLowerCase()
}

// Um tipo encaminhado a um usuário específico (Minhas Tarefas) é trabalho
// dele, não do responsável do cliente — então só conta na % de progresso do
// cliente se o dono do tipo for o próprio responsável do cliente. Tipo sem
// dono sempre conta. `donoNome` é o nome (profiles.nome) do responsavel_id do
// tipo; o vínculo com clientes_*.responsavel é por nome, sem FK.
export function tipoContaNoProgressoDoCliente(
  donoNome: string | null | undefined,
  clienteResponsavel: string | null | undefined,
): boolean {
  if (!normalizarNome(donoNome)) return true
  return normalizarNome(donoNome) === normalizarNome(clienteResponsavel)
}

// Recebe o mapa tipo -> nome do dono (só tipos com dono aparecem) e devolve
// só os tipos que contam na % do cliente.
export function filtrarTiposDoProgresso(
  tipos: Iterable<string>,
  clienteResponsavel: string | null | undefined,
  donoNomePorTipo: Record<string, string | null | undefined>,
): string[] {
  return Array.from(tipos).filter(tipo =>
    tipoContaNoProgressoDoCliente(donoNomePorTipo[tipo], clienteResponsavel)
  )
}
