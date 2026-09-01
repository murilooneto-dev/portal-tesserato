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
