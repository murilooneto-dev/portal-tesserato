// tests/fase6-clientes-ficha.test.ts — Clientes e Ficha do Societário e do Financeiro (Fase 6, Frente B).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const LISTAS = ['components/societario/ClientesListaSocietario.tsx', 'components/financeiro/ClientesListaFinanceiro.tsx']
const PAGINAS_LISTA = ['app/societario/clientes/page.tsx', 'app/financeiro/clientes/page.tsx']
const FICHAS = ['app/societario/clientes/[id]/page.tsx', 'app/financeiro/clientes/[id]/page.tsx']
const CHECKLIST = 'components/geral/TarefasSetorChecklist.tsx'
const TODOS = [...LISTAS, ...PAGINAS_LISTA, ...FICHAS, CHECKLIST]

for (const arq of TODOS) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
  })
}

test('páginas de lista sem o wrapper antigo p-8 max-w-7xl', () => {
  for (const arq of PAGINAS_LISTA) assert.ok(!ler(arq).includes('p-8 max-w-7xl'), arq)
})

for (const arq of LISTAS) {
  test(`${arq}: desenho s-02/fn-04`, () => {
    const src = ler(arq)
    for (const t of ['<Pagina>', 'titulo="Clientes"', 'MESES[mes - 1]', 'placeholder="Nome ou CNPJ"', 'sm:w-[300px]', 'sm:w-[220px]',
      'Todas as tarefas', 'rotulo="Só pendentes"', '<NomeCliente', '<BarraProgresso', 'largura={220}', 'largura={300}', 'largura={56}',
      'Município / UF', 'Progresso do mês', 'ChevronRight', '<Card semPadding className="hidden overflow-hidden sm:block">',
      'relative overflow-x-auto xl:overflow-visible', "p.liberada ? 'ok' : 'warn'"]) assert.ok(src.includes(t), t)
    // Sem botão no cabeçalho.
    assert.ok(!src.includes('acoes='))
    // Busca também por CNPJ só com dígitos.
    assert.ok(src.includes(".replace(/\\D/g, '')"))
  })
}

test('listas mantêm as chaves de filtro persistente', () => {
  for (const s of ['societario', 'financeiro']) {
    const src = ler(`components/${s}/ClientesLista${s === 'societario' ? 'Societario' : 'Financeiro'}.tsx`)
    for (const k of ['busca', 'tarefa', 'apenasPendentes']) assert.ok(src.includes(`'clientes-${s}:${k}'`), `${s}:${k}`)
    assert.ok(src.includes(`/${s}/clientes/\${cliente.id}`))
  }
})

for (const arq of FICHAS) {
  test(`${arq}: trilha, cabeçalho e checklist comum`, () => {
    const src = ler(arq)
    for (const t of ['aria-label="Caminho"', '<CabecalhoPagina', 'min-w-[15ch] truncate', 'CNPJ', 'Município / UF', 'Contato',
      'font-mono', 'TarefasSetorChecklist', 'tipoVisivelParaUsuario']) assert.ok(src.includes(t), t)
    assert.ok(!src.includes('ClienteCard'))
    assert.ok(!src.includes('Razão Social'))
    assert.ok(!src.includes('←'))
    // Único botão do cabeçalho: editar o cliente pela ficha.
    assert.ok(src.includes('<ClienteSetorSimplesAcoes'))
  })
}

test('ficha do Societário: duas colunas com o histórico de procedimentos', () => {
  const src = ler(FICHAS[0])
  for (const t of ['lg:grid-cols-[minmax(0,1fr)_400px]', 'avisoSalvoAutomatico', 'Histórico de procedimentos',
    'Nenhum procedimento para este cliente', 'Os procedimentos abertos em Procedimentos aparecem aqui com a situação e os anexos.',
    'tomStatusProcedimento(p.status)', 'rotuloStatusProcedimento(p.status)', '/api/arquivos/procedimento/${arq.id}', 'Paperclip']) assert.ok(src.includes(t), t)
  assert.ok(!src.includes('statusProcedimentoBadge'))
})

test('ficha do Financeiro: uma coluna, sem histórico de procedimentos', () => {
  const src = ler(FICHAS[1])
  assert.ok(src.includes('max-w-[820px]'))
  assert.ok(!src.includes('procedimentos'))
  assert.ok(!src.includes('avisoSalvoAutomatico'))
})

test('fichas mantêm as chamadas das actions com os mesmos argumentos', () => {
  const soc = ler(FICHAS[0])
  for (const t of ['listarTarefasSocietarioDoCliente(id, mes, ano)', 'toggleTarefaSocietario(id, tipo, mes, ano, concluida, data)',
    'atualizarEtapaSocietario(id, mes, ano, tipo, etapaNome, concluida, data)', 'salvarRespostaTextoSocietario(id, tipo, mes, ano, texto)']) assert.ok(soc.includes(t), t)
  const fin = ler(FICHAS[1])
  for (const t of ['listarTarefasFinanceiroDoCliente(id, mes, ano)', 'toggleTarefaFinanceiro(id, tipo, mes, ano, concluida, data)',
    'atualizarEtapaFinanceiro(id, mes, ano, tipo, etapaNome, concluida, data)', 'salvarRespostaTextoFinanceiro(id, tipo, mes, ano, texto)']) assert.ok(fin.includes(t), t)
})

test('checklist: título do mês, contador, linha de 56px, "Salvo" e erro', () => {
  const src = ler(CHECKLIST)
  for (const t of ['Tarefas de ${MESES[mes - 1].toLowerCase()}', "tom={completo ? 'ok' : 'acc'}", '{concluidas} de {total}',
    'Salvo automaticamente', 'min-h-14', 'h-2 w-2', "feito ? 'bg-ok' : 'bg-warn'", 'w-[70px]', '>Salvo', 'text-danger', 'role="alert"',
    'Digite a resposta…', 'min-h-16', 'ml-[38px]', 'sm:grid-cols-2', 'Nenhuma tarefa cadastrada para este cliente no período atual.']) assert.ok(src.includes(t), t)
})

test('checklist: só salva quando o valor muda e usa a formatação de data segura', () => {
  const src = ler(CHECKLIST)
  assert.ok(src.includes("from '@/lib/formatar-data'"))
  assert.ok(!src.includes('new Date('), 'sem new Date(iso), que recua um dia')
  assert.ok(src.includes('if (chaveData === dataOriginal) return'))
  assert.ok(src.includes('if (valor === original) return'))
  assert.ok(src.includes('if (chaveTexto.trim() === textoOriginal.trim()) return'))
  for (const t of ["onToggle(t.nome, chaveData.trim() !== '', iso)", "onAtualizarEtapa(t.nome, etapaNome, valor.trim() !== '', iso)",
    'onSalvarTexto(t.nome, chaveTexto)']) assert.ok(src.includes(t), t)
})

test('componentes antigos sem uso foram apagados', () => {
  for (const arq of ['components/societario/ClienteCard.tsx', 'components/financeiro/ClienteCardFinanceiro.tsx',
    'components/societario/TarefasSocietarioChecklist.tsx', 'components/financeiro/TarefasFinanceiroChecklist.tsx']) {
    assert.ok(!existsSync(join(process.cwd(), arq)), arq)
  }
})
