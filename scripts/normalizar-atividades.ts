import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Opções canônicas definidas pelo usuário
const ATIVIDADES_CANONICAS = [
  'SERVIÇO',
  'COMÉRCIO',
  'INDÚSTRIA',
  'SERVIÇO E COMÉRCIO',
  'SERVIÇO E INDÚSTRIA',
  'COMÉRCIO E INDÚSTRIA',
  'SERVIÇO E COMÉRCIO E INDÚSTRIA',
]

// Remove acentos e caracteres especiais para comparação
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacríticos
    .replace(/[^a-zA-Z\s]/g, ' ')     // remove não-alfanuméricos
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// Mapeia uma string quebrada para a canônica mais próxima
function mapearAtividade(raw: string): string | null {
  const n = normalizar(raw)

  // Keywords para identificar cada tipo
  const temServico   = /SERVI/.test(n)
  const temComercio  = /COMERC/.test(n)
  const temIndustria = /INDUST/.test(n)

  if (temServico && temComercio && temIndustria) return 'SERVIÇO E COMÉRCIO E INDÚSTRIA'
  if (temServico && temComercio)                 return 'SERVIÇO E COMÉRCIO'
  if (temServico && temIndustria)                return 'SERVIÇO E INDÚSTRIA'
  if (temComercio && temIndustria)               return 'COMÉRCIO E INDÚSTRIA'
  if (temServico)                                return 'SERVIÇO'
  if (temComercio)                               return 'COMÉRCIO'
  if (temIndustria)                              return 'INDÚSTRIA'

  return null // não mapeado
}

async function main() {
  // Busca todos os valores distintos de atividade
  const { data, error } = await supabase
    .from('clientes')
    .select('id, atividade')

  if (error) { console.error(error.message); process.exit(1) }
  if (!data?.length) { console.log('Nenhum cliente encontrado'); return }

  // Agrupa por valor atual
  const grupos = new Map<string, string[]>()
  for (const c of data) {
    const atv = c.atividade ?? ''
    if (!grupos.has(atv)) grupos.set(atv, [])
    grupos.get(atv)!.push(c.id)
  }

  console.log(`\n${grupos.size} valores distintos de atividade encontrados:\n`)

  let atualizados = 0
  let naoMapeados = 0

  for (const [raw, ids] of grupos) {
    const canonico = mapearAtividade(raw)
    const status = canonico ? `→ "${canonico}"` : '⚠ NÃO MAPEADO'
    console.log(`  "${raw}" (${ids.length} clientes) ${status}`)

    if (canonico) {
      const { error: upErr } = await supabase
        .from('clientes')
        .update({ atividade: canonico })
        .in('id', ids)

      if (upErr) console.error(`    ✗ Erro:`, upErr.message)
      else atualizados += ids.length
    } else {
      naoMapeados += ids.length
    }
  }

  console.log(`\n✓ ${atualizados} clientes atualizados`)
  if (naoMapeados > 0) console.log(`⚠ ${naoMapeados} clientes sem mapeamento — revise manualmente`)
}

main().catch(err => { console.error(err); process.exit(1) })
