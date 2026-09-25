// A empresa conta como desabilitada quando todos os setores onde ela tem
// linha (fiscal/contábil/pessoal) estão com ativo=false. Sem linha em nenhum
// desses setores não há o que desabilitar, então nunca é "desabilitada".
export function empresaDesabilitada(setores: ({ ativo: boolean } | null | undefined)[]): boolean {
  const existentes = setores.filter((s): s is { ativo: boolean } => !!s)
  return existentes.length > 0 && existentes.every(s => s.ativo === false)
}

export function empresaTemSetorDesabilitavel(setores: ({ ativo: boolean } | null | undefined)[]): boolean {
  return setores.some(s => !!s)
}
