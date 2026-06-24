import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const args = process.argv.slice(2)
const sqlitePath = args[0]

if (!sqlitePath) {
  console.error('Uso: npx tsx scripts/migrate.ts <caminho-do-arquivo.sqlite>')
  console.error('Exemplo: npx tsx scripts/migrate.ts C:\\dados\\fiscal.sqlite')
  process.exit(1)
}

console.log(`\nMigrando banco: ${sqlitePath}\n`)

const db = new Database(sqlitePath, { readonly: true })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const tabelas = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
`).all() as { name: string }[]

console.log('Tabelas encontradas no SQLite:')
tabelas.forEach(t => console.log(' -', t.name))
console.log()

async function migrarClientes() {
  const nomeTabela = tabelas.find(t =>
    ['clientes', 'cliente', 'empresas', 'empresa'].includes(t.name.toLowerCase())
  )?.name

  if (!nomeTabela) {
    console.warn('⚠ Tabela de clientes não encontrada. Pulando...')
    return
  }

  const rows = db.prepare(`SELECT * FROM "${nomeTabela}"`).all() as Record<string, unknown>[]
  console.log(`Migrando ${rows.length} clientes de "${nomeTabela}"...`)

  const clientes = rows.map(row => ({
    cod:         String(row.cod ?? row.codigo ?? ''),
    nome:        String(row.nome ?? row.razao_social ?? row.name ?? ''),
    cnpj:        row.cnpj ? String(row.cnpj) : null,
    regime:      row.regime ? String(row.regime) : null,
    atividade:   row.atividade ? String(row.atividade) : null,
    responsavel: row.responsavel ? String(row.responsavel) : null,
    grupo:       row.grupo ? String(row.grupo) : 'normal',
    obs:         row.obs ? String(row.obs) : null,
    prioridade:  Number(row.prioridade ?? 0),
    mit:         row.mit ? String(row.mit) : null,
  })).filter(c => c.nome.trim() !== '')

  const LOTE = 100
  let inseridos = 0
  for (let i = 0; i < clientes.length; i += LOTE) {
    const lote = clientes.slice(i, i + LOTE)
    const { error } = await supabase
      .from('clientes')
      .upsert(lote, { onConflict: 'cnpj' })

    if (error) {
      console.error(`  ✗ Erro no lote ${i}-${i + LOTE}:`, error.message)
    } else {
      inseridos += lote.length
      process.stdout.write(`  ✓ ${inseridos}/${clientes.length}\r`)
    }
  }

  console.log(`\n✓ ${inseridos} clientes migrados\n`)
}

async function main() {
  await migrarClientes()
  console.log('Migração concluída.')
  db.close()
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
