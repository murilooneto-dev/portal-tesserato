import { Client } from 'pg'
import 'dotenv/config'
import { clienteDe, listarArquivosComTamanho } from './lib-storage'

async function contarLinhasPorTabela(dbUrl: string): Promise<Map<string, number>> {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    const { rows: tabelas } = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )

    const contagens = new Map<string, number>()
    for (const { tablename } of tabelas) {
      const { rows } = await client.query(`select count(*)::int as total from "${tablename}"`)
      contagens.set(tablename, rows[0].total)
    }

    return contagens
  } finally {
    await client.end()
  }
}

async function contarArquivosPorBucket(
  url: string,
  key: string,
): Promise<Map<string, { arquivos: number; bytes: number }>> {
  const supabase = clienteDe(url, key)
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`Falha ao listar buckets: ${error.message}`)

  const resultado = new Map<string, { arquivos: number; bytes: number }>()
  for (const bucket of buckets ?? []) {
    // Recursivo: se algum bucket usar layout de pasta (ex:
    // `<client-id>/<arquivo>` — não confirmado, ver lib-storage.ts), uma
    // listagem só da raiz veria apenas pseudo-entradas de pasta e
    // reportaria 0 arquivos dos dois lados, "batendo" mesmo se nada tiver
    // sido copiado de verdade. A recursão cobre layout plano ou em pastas
    // de qualquer forma.
    const arquivos = await listarArquivosComTamanho(supabase.storage, bucket.name)
    const bytes = arquivos.reduce((soma, a) => soma + a.bytes, 0)
    resultado.set(bucket.name, { arquivos: arquivos.length, bytes })
  }
  return resultado
}

async function main() {
  const sourceDbUrl = process.env.SOURCE_DB_URL
  const targetDbUrl = process.env.TARGET_DB_URL
  const sourceUrl = process.env.SOURCE_SUPABASE_URL
  const sourceKey = process.env.SOURCE_SERVICE_ROLE_KEY
  const targetUrl = process.env.TARGET_SUPABASE_URL
  const targetKey = process.env.TARGET_SERVICE_ROLE_KEY

  if (!sourceDbUrl || !targetDbUrl || !sourceUrl || !sourceKey || !targetUrl || !targetKey) {
    throw new Error(
      'Defina SOURCE_DB_URL, TARGET_DB_URL, SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY.',
    )
  }

  console.log('=== Contando linhas por tabela (schema public) ===')
  const linhasOrigem = await contarLinhasPorTabela(sourceDbUrl)
  const linhasDestino = await contarLinhasPorTabela(targetDbUrl)

  let tudoOk = true
  const todasTabelas = new Set([...linhasOrigem.keys(), ...linhasDestino.keys()])
  for (const tabela of [...todasTabelas].sort()) {
    const origem = linhasOrigem.get(tabela) ?? 0
    const destino = linhasDestino.get(tabela) ?? 0
    const bate = origem === destino
    if (!bate) tudoOk = false
    console.log(`  ${bate ? 'OK ' : 'DIF'} ${tabela}: origem=${origem} destino=${destino}`)
  }

  console.log('\n=== Contando arquivos por bucket de Storage ===')
  const storageOrigem = await contarArquivosPorBucket(sourceUrl, sourceKey)
  const storageDestino = await contarArquivosPorBucket(targetUrl, targetKey)

  const todosBuckets = new Set([...storageOrigem.keys(), ...storageDestino.keys()])
  for (const bucket of [...todosBuckets].sort()) {
    const origem = storageOrigem.get(bucket) ?? { arquivos: 0, bytes: 0 }
    const destino = storageDestino.get(bucket) ?? { arquivos: 0, bytes: 0 }
    const bate = origem.arquivos === destino.arquivos && origem.bytes === destino.bytes
    if (!bate) tudoOk = false
    console.log(
      `  ${bate ? 'OK ' : 'DIF'} ${bucket}: origem=${origem.arquivos} arquivos/${origem.bytes} bytes ` +
        `destino=${destino.arquivos} arquivos/${destino.bytes} bytes`,
    )
  }

  console.log(tudoOk ? '\nParidade confirmada.' : '\nDIVERGÊNCIAS ENCONTRADAS — não prosseguir.')
  process.exit(tudoOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
