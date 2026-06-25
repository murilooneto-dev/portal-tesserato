import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as XLSX from 'xlsx'
import * as path from 'path'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('nome, cnpj, regime, atividade, responsavel, grupo, municipio, uf')
    .order('responsavel')
    .order('atividade')
    .order('nome')

  if (error) { console.error('Erro ao buscar clientes:', error.message); process.exit(1) }
  if (!clientes?.length) { console.error('Nenhum cliente encontrado'); process.exit(1) }

  console.log(`${clientes.length} clientes encontrados\n`)

  // Agrupa por responsável
  const porResponsavel = new Map<string, typeof clientes>()
  for (const c of clientes) {
    const resp = c.responsavel?.trim() || 'Sem Responsável'
    if (!porResponsavel.has(resp)) porResponsavel.set(resp, [])
    porResponsavel.get(resp)!.push(c)
  }

  const wb = XLSX.utils.book_new()

  // Uma aba por responsável
  for (const [responsavel, lista] of porResponsavel) {
    // Agrupa por atividade dentro do responsável
    const porAtividade = new Map<string, typeof clientes>()
    for (const c of lista) {
      const atv = c.atividade?.trim() || 'Sem Atividade'
      if (!porAtividade.has(atv)) porAtividade.set(atv, [])
      porAtividade.get(atv)!.push(c)
    }

    const linhas: (string | number)[][] = []

    for (const [atividade, empresas] of porAtividade) {
      // Cabeçalho da atividade
      linhas.push([`▸ ${atividade.toUpperCase()} (${empresas.length})`])
      linhas.push(['Nome', 'CNPJ', 'Regime', 'Município', 'UF', 'Grupo'])

      for (const e of empresas) {
        linhas.push([
          e.nome ?? '',
          e.cnpj ?? '',
          e.regime ?? '',
          e.municipio ?? '',
          e.uf ?? '',
          e.grupo ?? '',
        ])
      }

      linhas.push([]) // linha em branco entre grupos
    }

    const ws = XLSX.utils.aoa_to_sheet(linhas)

    // Largura das colunas
    ws['!cols'] = [
      { wch: 45 }, // Nome
      { wch: 18 }, // CNPJ
      { wch: 22 }, // Regime
      { wch: 20 }, // Município
      { wch: 6  }, // UF
      { wch: 12 }, // Grupo
    ]

    // Nome da aba: máx 31 chars (limite do Excel)
    const nomeAba = responsavel.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, nomeAba)

    console.log(`✓ Aba "${nomeAba}" — ${lista.length} clientes`)
  }

  // Aba resumo geral
  const resumo: (string | number)[][] = [
    ['Responsável', 'Atividade', 'Qtd Clientes'],
  ]
  for (const [responsavel, lista] of porResponsavel) {
    const contagem = new Map<string, number>()
    for (const c of lista) {
      const atv = c.atividade?.trim() || 'Sem Atividade'
      contagem.set(atv, (contagem.get(atv) ?? 0) + 1)
    }
    for (const [atv, qtd] of contagem) {
      resumo.push([responsavel, atv, qtd])
    }
  }
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

  const outPath = path.resolve('clientes-por-responsavel.xlsx')
  XLSX.writeFile(wb, outPath)
  console.log(`\n✓ Planilha gerada: ${outPath}`)
}

main().catch(err => { console.error('Erro:', err); process.exit(1) })
