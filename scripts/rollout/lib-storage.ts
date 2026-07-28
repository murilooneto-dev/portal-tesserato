import { createClient } from '@supabase/supabase-js'
import type { FileObject } from '@supabase/storage-js'

export function clienteDe(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type StorageClient = ReturnType<typeof clienteDe>['storage']

/**
 * Lista todos os itens de um bucket/prefixo, paginando até esgotar
 * (a API do Storage limita cada página; sem paginação, buckets com mais
 * itens que o limite de uma página perderiam os itens restantes em
 * silêncio).
 */
export async function listarPagina(
  storage: StorageClient,
  bucket: string,
  prefixo: string,
): Promise<FileObject[]> {
  const limit = 1000
  let offset = 0
  const itens: FileObject[] = []

  while (true) {
    const { data, error } = await storage.from(bucket).list(prefixo, { limit, offset })
    if (error) throw new Error(`Falha ao listar "${bucket}/${prefixo}": ${error.message}`)

    itens.push(...(data ?? []))
    // Página incompleta (menos que `limit`) = última página.
    if (!data || data.length < limit) break
    offset += limit
  }

  return itens
}

/**
 * Lista recursivamente todos os arquivos (não pastas) de um bucket,
 * descendo em qualquer subpasta encontrada. Se algum bucket usar layout de
 * pasta (ex: `<client-id>/<arquivo>`) — não confirmado, o app não tem
 * nenhuma chamada `.storage.` no próprio código (anexos ficam como base64
 * em colunas do Postgres) e não há bucket disponível em dev para checar —
 * uma listagem só da raiz veria apenas pseudo-entradas de pasta
 * (`id === null`) e nunca chegaria nos arquivos de verdade. A recursão
 * cobre os dois casos (layout plano ou em pastas) de qualquer forma, então
 * isso não depende de confirmar a suposição.
 */
export async function listarTodosObjetos(
  storage: StorageClient,
  bucket: string,
  prefixo = '',
): Promise<string[]> {
  const itens = await listarPagina(storage, bucket, prefixo)

  const caminhos: string[] = []
  for (const item of itens) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id === null) {
      // pasta — desce recursivamente
      caminhos.push(...(await listarTodosObjetos(storage, bucket, caminho)))
    } else {
      caminhos.push(caminho)
    }
  }
  return caminhos
}

/**
 * Lista recursivamente todos os arquivos de um bucket e retorna também o
 * tamanho de cada um (usado para paridade — contagem por si só não
 * detecta um arquivo trocado por outro do mesmo nome com tamanho diferente).
 */
export async function listarArquivosComTamanho(
  storage: StorageClient,
  bucket: string,
  prefixo = '',
): Promise<{ caminho: string; bytes: number }[]> {
  const itens = await listarPagina(storage, bucket, prefixo)

  const resultado: { caminho: string; bytes: number }[] = []
  for (const item of itens) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id === null) {
      // pasta — desce recursivamente
      resultado.push(...(await listarArquivosComTamanho(storage, bucket, caminho)))
    } else {
      resultado.push({ caminho, bytes: item.metadata?.size ?? 0 })
    }
  }
  return resultado
}
