import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function properCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

async function main() {
  const { data, error } = await supabase
    .from('parcelamentos')
    .select('id, responsavel')

  if (error) { console.error(error.message); process.exit(1) }

  const rows = (data ?? []) as { id: string; responsavel: string | null }[]

  // Agrupa por nome normalizado (lowercase sem espaços extras)
  const grupos: Record<string, { canonico: string; ids: string[] }> = {}

  for (const row of rows) {
    if (!row.responsavel) continue
    const chave = row.responsavel.trim().toLowerCase()
    if (!grupos[chave]) {
      grupos[chave] = { canonico: properCase(row.responsavel), ids: [] }
    }
    grupos[chave].ids.push(row.id)
  }

  // Mostra o que vai ser unificado
  console.log('\n=== Responsáveis encontrados ===\n')
  for (const [chave, grupo] of Object.entries(grupos)) {
    const variacoes = Array.from(new Set(
      rows.filter(r => r.responsavel?.trim().toLowerCase() === chave).map(r => r.responsavel!)
    ))
    if (variacoes.length > 1) {
      console.log(`⚠  Variações para "${grupo.canonico}": ${variacoes.join(' | ')}  → unificar para "${grupo.canonico}"`)
    } else {
      console.log(`✓  "${grupo.canonico}" (${grupo.ids.length} registros)`)
    }
  }

  // Executa a unificação
  console.log('\n=== Aplicando normalização ===\n')
  let atualizados = 0

  for (const [, grupo] of Object.entries(grupos)) {
    const { error: upErr } = await supabase
      .from('parcelamentos')
      .update({ responsavel: grupo.canonico })
      .in('id', grupo.ids)

    if (upErr) {
      console.error(`Erro ao atualizar "${grupo.canonico}":`, upErr.message)
    } else {
      console.log(`✓  "${grupo.canonico}" — ${grupo.ids.length} registros atualizados`)
      atualizados += grupo.ids.length
    }
  }

  console.log(`\n✓ Total: ${atualizados} registros normalizados.\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
