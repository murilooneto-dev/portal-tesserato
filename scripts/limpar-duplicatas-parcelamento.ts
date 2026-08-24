import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TarefaRow {
  id: string
  parcelamento_id: string
  mes: number
  ano: number
  setor: string
  tipo: string
  concluida: boolean
}

async function main() {
  const apply = process.argv.includes('--apply')

  const { data, error } = await supabase
    .from('tarefas')
    .select('id, parcelamento_id, mes, ano, setor, tipo, concluida')
    .not('parcelamento_id', 'is', null)

  if (error) { console.error(error.message); process.exit(1) }

  const tarefas = (data ?? []) as TarefaRow[]
  console.log(`\n${tarefas.length} tarefas com parcelamento_id carregadas\n`)

  const grupos = new Map<string, TarefaRow[]>()
  for (const t of tarefas) {
    const chave = `${t.parcelamento_id}|${t.mes}|${t.ano}|${t.setor}`
    const grupo = grupos.get(chave) ?? []
    grupo.push(t)
    grupos.set(chave, grupo)
  }

  const duplicados = Array.from(grupos.values()).filter(g => g.length > 1)
  console.log(`${duplicados.length} grupo(s) duplicado(s) encontrado(s)\n`)

  let totalApagadas = 0

  for (const grupo of duplicados) {
    const ordenado = [...grupo].sort((a, b) => a.id.localeCompare(b.id))
    // Sobrevivente: prioriza a que ja esta concluida (nunca perde progresso
    // ja marcado); empate ou nenhuma concluida, fica a de menor id.
    const sobrevivente = ordenado.find(t => t.concluida) ?? ordenado[0]
    const restante = ordenado.filter(t => t.id !== sobrevivente.id)

    console.log(`Grupo parcelamento_id=${sobrevivente.parcelamento_id} mes=${sobrevivente.mes}/${sobrevivente.ano} setor=${sobrevivente.setor}:`)
    console.log(`  sobrevive: ${sobrevivente.id} ("${sobrevivente.tipo}", concluida=${sobrevivente.concluida})`)
    for (const t of restante) {
      console.log(`  apaga:     ${t.id} ("${t.tipo}", concluida=${t.concluida})`)
    }

    if (apply) {
      const idsParaApagar = restante.map(t => t.id)
      const { error: delErr } = await supabase.from('tarefas').delete().in('id', idsParaApagar)
      if (delErr) {
        console.error(`  ERRO ao apagar: ${delErr.message}`)
      } else {
        totalApagadas += idsParaApagar.length
      }
    }
  }

  console.log(`\n${apply ? 'Aplicado' : 'Dry-run (nada foi alterado)'}: ${duplicados.length} grupo(s), ${totalApagadas} tarefa(s) apagada(s).`)
  if (!apply && duplicados.length > 0) {
    console.log('\nRode de novo com --apply pra aplicar de verdade.')
  }
  if (apply && duplicados.length > 0) {
    console.log('\nO nome da sobrevivente pode continuar com o nome antigo ate a proxima\nsincronizacao automatica (abra o Dashboard Fiscal/Pessoal do mes em\nquestao uma vez, com o fix ja aplicado, pra renomear).')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
