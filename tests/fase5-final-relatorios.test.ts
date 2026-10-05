// tests/fase5-final-relatorios.test.ts — Fase 5 final, frente B: Relatórios
// (Contábil/Pessoal), lista de clientes do Contábil e Preenchimento rápido
// (Contábil/Pessoal) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const RELATORIOS = ['components/contabil/RelatoriosContabil.tsx', 'components/pessoal/RelatoriosPessoal.tsx']
const LISTA = 'components/contabil/ClientesListaContabil.tsx'
const PREENCHIMENTO = ['app/contabil/preenchimento-rapido/page.tsx', 'app/pessoal/preenchimento-rapido/page.tsx']
const TODOS = [
  ...RELATORIOS,
  'app/contabil/relatorios/page.tsx',
  'app/pessoal/relatorios/page.tsx',
  LISTA,
  'app/contabil/clientes/page.tsx',
  ...PREENCHIMENTO,
]

for (const arq of TODOS) {
  test(`${arq}: sem fonte abaixo de 12px, sem [var(--fg)], sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.ok(!src.includes('[var(--accent)]'))
    assert.doesNotMatch(src, /indigo-/)
    assert.doesNotMatch(src, /\u{1F5A8}/u, 'sem emoji de impressora')
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
  })
}

for (const arq of RELATORIOS) {
  const setor = arq.includes('contabil') ? 'Contábil' : 'Pessoal'
  test(`${arq}: cabeçalho, botão e filtros no padrão do sistema`, () => {
    const src = ler(arq)
    assert.ok(src.includes('<Pagina'), 'usa Pagina')
    assert.ok(src.includes('titulo="Relatórios"'))
    assert.ok(src.includes(`Situação da carteira do ${setor} em \${MESES_NOME[mes - 1]} \${ano}`))
    assert.ok(src.includes('<Button variante="primario" icone={<Printer'), 'botão do sistema')
    assert.ok(src.includes('<Field rotulo="Responsável"'))
    assert.ok(src.includes('<Field rotulo="Tarefa"'))
    assert.ok(src.includes('rotulo="Só com pendências"'))
  })
  test(`${arq}: KPIs e tabela sem hex soltos; CNPJ embaixo do nome; sem coluna "#"`, () => {
    const src = ler(arq)
    // Hex só pode existir no HTML de impressão (string do imprimir()).
    const tela = src.slice(src.indexOf('const statsCards'))
    assert.doesNotMatch(tela, /#[0-9a-fA-F]{6}\b/)
    assert.ok(tela.includes('text-ok') && tela.includes('text-warn') && tela.includes('text-danger'))
    assert.ok(src.includes('<NomeCliente nome={r.cliente.nome} cnpj={r.cliente.cnpj ?? null} />'))
    assert.ok(!src.includes("titulo: 'CNPJ'"), 'sem coluna CNPJ na tela')
    assert.ok(!src.includes('<th>CNPJ</th>'), 'sem coluna CNPJ na impressão')
    assert.ok(!src.includes('<th>#</th>'))
    assert.ok(src.includes('{feitas}/{total}'), 'progresso como 1/9')
    assert.ok(src.includes('+{r.pendentes.length - 3}'), 'pendentes como chips com +N')
    assert.ok(src.includes('relative overflow-x-auto') && src.includes('<Tabela'))
    assert.ok(src.includes('function Responsavel('), 'responsável com avatar')
  })
}

test('Relatórios: chaves de filtro salvas continuam as mesmas', () => {
  const c = ler('components/contabil/RelatoriosContabil.tsx')
  for (const k of ['responsavel', 'grupo', 'tarefa', 'pendencia']) assert.ok(c.includes(`'relatorios-contabil:${k}'`), k)
  assert.ok(c.includes('<Field rotulo="Grupo"'))
  const p = ler('components/pessoal/RelatoriosPessoal.tsx')
  for (const k of ['responsavel', 'tarefa', 'pendencia', 'regime']) assert.ok(p.includes(`'relatorios-pessoal:${k}'`), k)
  assert.ok(p.includes('<Field rotulo="Regime"'), 'Pessoal filtra por Regime (p-04)')
  assert.ok(p.includes('filtrarTarefasVisiveis('), 'Pessoal mantém meses visíveis por tipo')
})

test('Lista de clientes do Contábil: faixa e cálculo intactos', () => {
  const src = ler(LISTA)
  assert.ok(src.includes('<div className="grid min-w-[620px] grid-cols-12 gap-1">'))
  assert.ok(src.includes('const pct = total > 0 ? normalizarPercentual((concluidas / total) * 100) : null'))
  assert.ok(src.includes("href={`/contabil/clientes/${cliente.id}?mes=${mesNum}&ano=${ano}`}"))
  assert.ok(src.includes("boxShadow: 'inset 0 0 0 2px var(--acc)'"))
  const page = ler('app/contabil/clientes/page.tsx')
  assert.ok(page.includes('prog.concluidasPorMes[t.mes] = (prog.concluidasPorMes[t.mes] ?? 0) + 1'))
  assert.ok(!page.includes('className="p-8"'), 'sem o wrapper p-8')
})

test('Lista de clientes do Contábil: cabeçalho, filtros com rótulo, legenda e celular', () => {
  const src = ler(LISTA)
  assert.ok(src.includes('<Pagina>') && src.includes('titulo="Clientes"'))
  assert.ok(src.includes('>Novo cliente</Button>'))
  assert.ok(src.includes('<EmpresaContabilModal') && src.includes('clienteId={null}'), 'mesma janela de hoje')
  for (const r of ['Buscar', 'Responsável', 'Regime', 'Prioridade']) assert.ok(src.includes(`<Field rotulo="${r}"`), r)
  assert.ok(src.includes('rotulo="Mostrar desabilitados"'))
  for (const k of ['busca', 'responsavel', 'regime', 'prioridade', 'mostrarDesabilitados']) {
    assert.ok(src.includes(`'clientes-contabil:${k}'`), k)
  }
  assert.ok(src.includes('Tarefas concluídas no mês:'))
  assert.ok(src.includes('nenhuma') && src.includes('em andamento') && src.includes('todas'))
  assert.ok(src.includes('deslize os meses para o lado'))
  assert.ok(src.includes('aria-expanded={filtrosAbertos}'), 'botão de filtros no celular')
  assert.ok(src.includes('function Responsavel('), 'responsável com avatar')
  assert.ok(!src.includes('CORES_RESP'), 'sem paleta hex própria')
})

test('Preenchimento rápido do Contábil e do Pessoal: Pagina + CabecalhoPagina, actions iguais', () => {
  for (const arq of PREENCHIMENTO) {
    const src = ler(arq)
    assert.ok(src.includes('<Pagina>') && src.includes('titulo="Preenchimento rápido"'), arq)
    assert.ok(!src.includes('p-8'), arq)
    // modo direto (todos os clientes) mantido de propósito: ver relatório da frente B
    assert.ok(src.includes('camposDisponiveis={[]}'), arq)
    assert.ok(src.includes('filtroPendentes'), arq)
  }
  assert.ok(ler(PREENCHIMENTO[0]).includes('await toggleTarefaContabil(clienteId, tipo, mes, ano, concluida)'))
  assert.ok(ler(PREENCHIMENTO[1]).includes('await toggleTarefaPessoal(clienteId, tipo, mes, ano, concluida)'))
})
