import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s\-\/]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

const MAPEAMENTOS: { match: (n: string) => boolean; canonico: string }[] = [
  { match: n => n.includes('RELAT') && n.includes('ENTRADA') && n.includes('SIGA'), canonico: 'RELATÓRIO DE ENTRADAS - SIGA' },
  { match: n => n.includes('RELAT') && n.includes('SAIDA')   && n.includes('SIGA'), canonico: 'RELATÓRIO DE SAÍDAS - SIGA'  },
  { match: n => n.includes('RELAT') && n.includes('SIGA') && !n.includes('ENTRADA') && !n.includes('SAIDA'), canonico: 'RELATÓRIO - SIGA' },
]

async function main() {
  const { data, error } = await supabase.from('tarefas').select('id, cliente_id, mes, ano, tipo, concluida')
  if (error) { console.error(error.message); process.exit(1) }

  const tarefas = data ?? []
  console.log(`\n${tarefas.length} tarefas carregadas\n`)

  let deletados = 0
  let atualizados = 0

  // Agrupa por (cliente_id, mes, ano) para detectar colisões
  const chave = (t: typeof tarefas[0]) => `${t.cliente_id}|${t.mes}|${t.ano}`

  // Para cada tarefa quebrada, verifica se já existe a canônica
  const idsParaDeletar: string[] = []
  const idsParaAtualizar: { id: string; canonico: string }[] = []

  for (const t of tarefas) {
    const n = normalizar(t.tipo ?? '')
    const mapa = MAPEAMENTOS.find(m => m.match(n))
    if (!mapa || t.tipo === mapa.canonico) continue

    // Verifica se já existe a versão canônica para o mesmo cliente+mes+ano
    const jaExiste = tarefas.some(
      other => other.cliente_id === t.cliente_id &&
               other.mes === t.mes &&
               other.ano === t.ano &&
               other.tipo === mapa.canonico
    )

    if (jaExiste) {
      idsParaDeletar.push(t.id)
    } else {
      idsParaAtualizar.push({ id: t.id, canonico: mapa.canonico })
    }
  }

  console.log(`Registros para DELETAR (duplicata): ${idsParaDeletar.length}`)
  console.log(`Registros para ATUALIZAR (único):   ${idsParaAtualizar.length}\n`)

  // Deleta em lotes de 100
  for (let i = 0; i < idsParaDeletar.length; i += 100) {
    const lote = idsParaDeletar.slice(i, i + 100)
    const { error: delErr } = await supabase.from('tarefas').delete().in('id', lote)
    if (delErr) console.error('Erro ao deletar:', delErr.message)
    else deletados += lote.length
  }

  // Atualiza em lotes individuais
  for (const { id, canonico } of idsParaAtualizar) {
    const { error: upErr } = await supabase.from('tarefas').update({ tipo: canonico }).eq('id', id)
    if (upErr) console.error('Erro ao atualizar:', upErr.message)
    else atualizados++
  }

  console.log(`✓ ${deletados} duplicatas deletadas`)
  console.log(`✓ ${atualizados} registros atualizados`)
  console.log('\nConcluído!')
}

main().catch(err => { console.error(err); process.exit(1) })
