export const POR_PAGINA = 100

export function paginar(
  paginaBruta: string | undefined,
  total: number,
  porPagina: number = POR_PAGINA,
): { pagina: number; totalPaginas: number; de: number; ate: number } {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const n = Number.parseInt(paginaBruta ?? '1', 10)
  const pagina = Number.isFinite(n) ? Math.min(Math.max(n, 1), totalPaginas) : 1
  return { pagina, totalPaginas, de: (pagina - 1) * porPagina, ate: pagina * porPagina - 1 }
}
