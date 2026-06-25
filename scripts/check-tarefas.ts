import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TAREFAS_GRUPO: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}

const MES_ATUAL  = new Date().getMonth() + 1
const ANO_ATUAL  = new Date().getFullYear()

async function main() {
  // 1. Clientes por grupo
  const { data: clientes } = await supabase.from('clientes').select('id,nome,grupo,responsavel').order('nome')
  const cs = clientes ?? []

  const normal  = cs.filter(c => !c.grupo || c.grupo === 'normal')
  const simples = cs.filter(c => c.grupo === 'simples')
  const mei     = cs.filter(c => c.grupo === 'mei')

  const esperadoNormal  = normal.length  * TAREFAS_GRUPO.normal.length
  const esperadoSimples = simples.length * TAREFAS_GRUPO.simples.length
  const esperadoMei     = mei.length     * TAREFAS_GRUPO.mei.length
  const totalEsperado   = esperadoNormal + esperadoSimples + esperadoMei

  console.log('\n═══════════════════════════════════════')
  console.log('  DIAGNÓSTICO DE TAREFAS')
  console.log(`  Mês ${MES_ATUAL}/${ANO_ATUAL}`)
  console.log('═══════════════════════════════════════')
  console.log(`\nClientes: ${cs.length} total`)
  console.log(`  Normal : ${normal.length} × ${TAREFAS_GRUPO.normal.length} tarefas = ${esperadoNormal} esperadas`)
  console.log(`  Simples: ${simples.length} × ${TAREFAS_GRUPO.simples.length} tarefas = ${esperadoSimples} esperadas`)
  console.log(`  MEI    : ${mei.length} × ${TAREFAS_GRUPO.mei.length} tarefa  = ${esperadoMei} esperadas`)
  console.log(`  TOTAL ESPERADO: ${totalEsperado}`)

  // 2. Tarefas no banco para o mês atual
  const { data: tarefas, count } = await supabase
    .from('tarefas')
    .select('*', { count: 'exact' })
    .eq('mes', MES_ATUAL)
    .eq('ano', ANO_ATUAL)
    .limit(10000)

  const ts = tarefas ?? []
  const concluidas = ts.filter(t => t.concluida).length
  const pendentes  = ts.length - concluidas

  console.log(`\nNo banco (${MES_ATUAL}/${ANO_ATUAL}):`)
  console.log(`  Linhas registradas: ${ts.length}`)
  console.log(`  Concluídas        : ${concluidas}`)
  console.log(`  Pendentes         : ${pendentes}`)
  console.log(`  Faltando registrar: ${totalEsperado - ts.length} (nunca foram marcadas/desmarcadas)`)

  if (ts.length > 0) {
    const pct = Math.round((concluidas / ts.length) * 100)
    console.log(`  % (linhas no banco): ${pct}%`)
  }
  if (totalEsperado > 0) {
    const pctEsp = Math.round((concluidas / totalEsperado) * 100)
    console.log(`  % (total esperado) : ${pctEsp}%`)
  }

  // 3. Por responsável
  const resps = Array.from(new Set(cs.map(c => c.responsavel).filter(Boolean))) as string[]
  console.log('\n─────────────────────────────────────────')
  console.log('Por responsável:')
  for (const resp of resps.sort()) {
    const rClientes = cs.filter(c => c.responsavel?.toLowerCase() === resp.toLowerCase())
    const rEsperado = rClientes.reduce((acc, c) => {
      const grupo = c.grupo ?? 'normal'
      return acc + (TAREFAS_GRUPO[grupo]?.length ?? TAREFAS_GRUPO.normal.length)
    }, 0)
    const rTarefas = ts.filter(t => rClientes.some(c => c.id === t.cliente_id))
    const rConc    = rTarefas.filter(t => t.concluida).length
    const pct      = rTarefas.length > 0 ? Math.round((rConc / rTarefas.length) * 100) : 0
    const pctEsp   = rEsperado > 0 ? Math.round((rConc / rEsperado) * 100) : 0
    console.log(`  ${resp.padEnd(15)} | ${rClientes.length} clientes | banco: ${String(rConc).padStart(3)}/${String(rTarefas.length).padStart(3)} (${String(pct).padStart(3)}%) | esperado: ${String(rConc).padStart(3)}/${String(rEsperado).padStart(4)} (${String(pctEsp).padStart(3)}%)`)
  }

  // 4. Tipos de tarefa que existem no banco mas NÃO estão em nenhum grupo
  const tiposNoBanco = Array.from(new Set(ts.map(t => t.tipo)))
  const todosEsperados = new Set([...TAREFAS_GRUPO.normal, ...TAREFAS_GRUPO.simples, ...TAREFAS_GRUPO.mei])
  const tiposExtras = tiposNoBanco.filter(t => !todosEsperados.has(t))
  if (tiposExtras.length > 0) {
    console.log('\n⚠  Tipos no banco que NÃO estão em nenhum grupo (não contados):')
    for (const t of tiposExtras) {
      const qtd = ts.filter(x => x.tipo === t).length
      const conc = ts.filter(x => x.tipo === t && x.concluida).length
      console.log(`   "${t}" — ${conc}/${qtd}`)
    }
  } else {
    console.log('\n✓ Todos os tipos no banco correspondem aos grupos definidos.')
  }

  // 5. Tipos esperados que não têm NENHUMA linha no banco
  const tiposAusentes = [...todosEsperados].filter(t => !tiposNoBanco.includes(t))
  if (tiposAusentes.length > 0) {
    console.log('\n⚠  Tipos esperados sem nenhuma linha no banco (mês atual):')
    tiposAusentes.forEach(t => console.log(`   "${t}"`))
  }

  console.log('\n═══════════════════════════════════════\n')
}

main().catch(err => { console.error(err); process.exit(1) })
