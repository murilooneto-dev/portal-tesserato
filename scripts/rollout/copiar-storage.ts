import 'dotenv/config'
import { clienteDe, listarTodosObjetos } from './lib-storage'

async function copiarStorage(dryRun: boolean) {
  const sourceUrl = process.env.SOURCE_SUPABASE_URL
  const sourceKey = process.env.SOURCE_SERVICE_ROLE_KEY
  const targetUrl = process.env.TARGET_SUPABASE_URL
  const targetKey = process.env.TARGET_SERVICE_ROLE_KEY
  if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
    throw new Error(
      'Defina SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL e TARGET_SERVICE_ROLE_KEY.',
    )
  }

  const origem = clienteDe(sourceUrl, sourceKey)
  const destino = clienteDe(targetUrl, targetKey)

  const { data: buckets, error: erroBuckets } = await origem.storage.listBuckets()
  if (erroBuckets) throw new Error(`Falha ao listar buckets: ${erroBuckets.message}`)

  for (const bucket of buckets ?? []) {
    console.log(`\n=== Bucket: ${bucket.name} ===`)

    try {
      if (!dryRun) {
        const { error: erroCriar } = await destino.storage.createBucket(bucket.name, {
          public: bucket.public,
        })
        if (erroCriar && !erroCriar.message.includes('already exists')) {
          throw new Error(
            `Falha ao criar bucket "${bucket.name}" no destino: ${erroCriar.message}`,
          )
        }
      }

      const objetos = await listarTodosObjetos(origem.storage, bucket.name)
      console.log(`${objetos.length} objeto(s) encontrado(s).`)

      if (dryRun) {
        for (const caminho of objetos) console.log(`  [dry-run] copiaria: ${caminho}`)
        continue
      }

      for (const caminho of objetos) {
        const { data: arquivo, error: erroDownload } = await origem.storage
          .from(bucket.name)
          .download(caminho)
        if (erroDownload) {
          console.error(`  Falha ao baixar "${caminho}": ${erroDownload.message}`)
          continue
        }

        const { error: erroUpload } = await destino.storage
          .from(bucket.name)
          .upload(caminho, arquivo, { upsert: true })
        if (erroUpload) {
          console.error(`  Falha ao subir "${caminho}": ${erroUpload.message}`)
          continue
        }

        console.log(`  copiado: ${caminho}`)
      }
    } catch (err) {
      console.error(
        `  Falha no bucket "${bucket.name}", pulando para o próximo: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      continue
    }
  }
}

const dryRun = process.argv.includes('--dry-run')
copiarStorage(dryRun).catch((err) => {
  console.error(err)
  process.exit(1)
})
