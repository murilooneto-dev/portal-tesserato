// lib/financeiro-movimentos.ts
//
// Leitura dos lançamentos do Financeiro (Recebimentos, Pagamentos e
// Relatórios). O Supabase (PostgREST) devolve no máximo 1000 linhas por
// requisição mesmo quando `.limit()` pede mais, então a busca anda em blocos
// de 1000 com `.range()` até vir um bloco incompleto (mesmo modelo de
// lib/tarefas-paginacao.ts). Antes as listas paravam em 200 e o relatório em
// 1000 sem aviso, e o total mostrado ficava errado.

export const TAMANHO_BLOCO = 1000

type Bloco<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Chama `consulta(inicio, fim)` em blocos de 1000 e junta tudo. */
export async function buscarEmBlocos<T>(consulta: (inicio: number, fim: number) => Bloco<T>): Promise<T[]> {
  const linhas: T[] = []
  for (let inicio = 0; ; inicio += TAMANHO_BLOCO) {
    const { data, error } = await consulta(inicio, inicio + TAMANHO_BLOCO - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    linhas.push(...data)
    if (data.length < TAMANHO_BLOCO) break
  }
  return linhas
}

export function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Valor com sinal na frente para saídas e saldo negativo: "- R$ 1.750,00". */
export function formatarValorComSinal(v: number): string {
  return v < 0 ? `- ${formatarValor(Math.abs(v))}` : formatarValor(v)
}
