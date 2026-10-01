// lib/mes-navegacao.ts — navegação do mês de trabalho (funções puras).
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] as const

export function mesVizinho(mes: number, ano: number, delta: -1 | 1): { mes: number; ano: number } {
  const indice = ano * 12 + (mes - 1) + delta
  return { mes: (indice % 12) + 1, ano: Math.floor(indice / 12) }
}

export function rotuloMes(mes: number, ano: number): string {
  return `${MESES[mes - 1]} ${ano}`
}
