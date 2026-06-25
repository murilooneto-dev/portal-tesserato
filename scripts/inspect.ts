import Database from 'better-sqlite3'

const sqlitePath = process.argv[2]
if (!sqlitePath) { console.error('Uso: npx tsx scripts/inspect.ts <banco.sqlite>'); process.exit(1) }

const db = new Database(sqlitePath, { readonly: true })

const row = db.prepare('SELECT payload FROM app_data LIMIT 1').get() as { payload: string }
const payload = JSON.parse(row.payload)

console.log('\n=== CHAVES RAIZ DO PAYLOAD ===')
for (const key of Object.keys(payload)) {
  const val = payload[key]
  if (Array.isArray(val)) {
    console.log(` "${key}": Array[${val.length}]`)
    if (val.length > 0) console.log('   exemplo:', JSON.stringify(val[0]).slice(0, 150))
  } else if (typeof val === 'object' && val !== null) {
    const subkeys = Object.keys(val)
    console.log(` "${key}": Object { ${subkeys.slice(0, 5).join(', ')}${subkeys.length > 5 ? '...' : ''} } (${subkeys.length} chaves)`)
    if (subkeys.length > 0) {
      const firstVal = val[subkeys[0]]
      console.log(`   ex ["${subkeys[0]}"]`, JSON.stringify(firstVal).slice(0, 150))
    }
  } else {
    console.log(` "${key}":`, String(val).slice(0, 100))
  }
}

db.close()
