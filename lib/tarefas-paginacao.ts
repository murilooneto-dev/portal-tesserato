import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Busca todas as linhas de `tarefas` para um mes/ano, paginando em blocos de 1000.
 * O Supabase (PostgREST) limita cada requisição a um numero maximo de linhas
 * (configuravel no projeto, default 1000) mesmo quando `.limit()` pede mais —
 * por isso precisa paginar em vez de so aumentar o limit.
 */
export async function buscarTodasTarefasDoMes<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  colunas: string = '*'
): Promise<T[]> {
  const linhas: T[] = []
  const TAMANHO_PAGINA = 1000

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('tarefas')
      .select(colunas)
      .eq('mes', mes)
      .eq('ano', ano)
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    linhas.push(...(data as unknown as T[]))
    if (data.length < TAMANHO_PAGINA) break
  }

  return linhas
}

/**
 * Busca todas as linhas de `tarefas` sem filtro de mes/ano (tabela inteira), paginando
 * em blocos de 1000 pelo mesmo motivo de `buscarTodasTarefasDoMes`.
 */
export async function buscarTodasTarefas<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  colunas: string = '*'
): Promise<T[]> {
  const linhas: T[] = []
  const TAMANHO_PAGINA = 1000

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('tarefas')
      .select(colunas)
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    linhas.push(...(data as unknown as T[]))
    if (data.length < TAMANHO_PAGINA) break
  }

  return linhas
}
