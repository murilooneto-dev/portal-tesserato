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

export function normalizarNome(nome: string | null | undefined): string {
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

// O dono de tipos de tarefa pode marcar os regimes que atende (Minhas Tarefas,
// tabela minhas_tarefas_regimes). Sem nada marcado ele atende todos os
// clientes, como sempre foi. Com regimes marcados, só os clientes desses
// regimes; nos demais (e nos sem regime) o tipo se comporta como tipo sem dono.
export function donoAtendeRegime(
  regimesDoDono: readonly string[] | null | undefined,
  regimeCliente: string | null | undefined,
): boolean {
  const marcados = (regimesDoDono ?? []).map(normalizarNome).filter(Boolean)
  if (marcados.length === 0) return true
  const regime = normalizarNome(regimeCliente)
  return regime !== '' && marcados.includes(regime)
}

// Recorta um mapa tipo -> dono (id ou nome) para UM cliente: sai o tipo cujo
// dono não atende o regime daquele cliente. `regimesPorTipo` é tipo -> regimes
// marcados pelo dono do tipo; tipo ausente = dono atende todos.
export function donosNoRegime<T>(
  donoPorTipo: Record<string, T>,
  regimesPorTipo: Record<string, readonly string[] | undefined>,
  regimeCliente: string | null | undefined,
): Record<string, T> {
  const saida: Record<string, T> = {}
  for (const [tipo, dono] of Object.entries(donoPorTipo)) {
    if (donoAtendeRegime(regimesPorTipo[tipo], regimeCliente)) saida[tipo] = dono
  }
  return saida
}

// O tipo aparece para este usuário NESTE cliente? O dono só vale se atende o
// regime do cliente (donoAtendeRegime); fora disso o tipo vale como sem dono.
// Admin vê tudo. Mesmo critério da ficha do cliente do Fiscal.
export function tipoVisivelNoCliente(
  donoId: string | null | undefined,
  regimesDoDono: readonly string[] | null | undefined,
  regimeCliente: string | null | undefined,
  userId: string,
  role: string | null | undefined,
): boolean {
  const donoNoCliente = donoAtendeRegime(regimesDoDono, regimeCliente) ? donoId : null
  return tipoVisivelParaUsuario(donoNoCliente, userId, role)
}

// Tipos que o usuário NÃO vê neste cliente. `donoIdPorTipo` é tipo -> dono (só
// tipos com dono) e `regimesPorTipo` é tipo -> regimes marcados pelo dono.
export function tiposOcultosNoCliente(
  donoIdPorTipo: Record<string, string | null | undefined>,
  regimesPorTipo: Record<string, readonly string[] | undefined>,
  regimeCliente: string | null | undefined,
  userId: string,
  role: string | null | undefined,
): string[] {
  return Object.keys(donoIdPorTipo).filter(
    tipo => !tipoVisivelNoCliente(donoIdPorTipo[tipo], regimesPorTipo[tipo], regimeCliente, userId, role),
  )
}
