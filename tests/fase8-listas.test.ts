// tests/fase8-listas.test.ts — listas, painéis e calendários no celular (Fase 8, Frente B).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')
const tem = (src: string, textos: string[], arq = '') => { for (const t of textos) assert.ok(src.includes(t), `${arq}: ${t}`) }

const LISTAS_COM_CARTAO = {
  'components/fiscal/ClientesLista.tsx': 'fiscal',
  'components/pessoal/ClientesListaPessoal.tsx': 'pessoal',
  'components/societario/ClientesListaSocietario.tsx': 'societario',
  'components/financeiro/ClientesListaFinanceiro.tsx': 'financeiro',
} as const
const LISTA_GERAL = 'components/geral/ClientesGeralLista.tsx'
const LISTA_CONTABIL = 'components/contabil/ClientesListaContabil.tsx'
const LISTAS = [...Object.keys(LISTAS_COM_CARTAO), LISTA_GERAL, LISTA_CONTABIL]

const DASHBOARDS = ['app/fiscal/dashboard/page.tsx', 'app/contabil/dashboard/page.tsx', 'app/pessoal/dashboard/page.tsx']
const CALENDARIO = 'components/calendario/CalendarioSetor.tsx'
const EVENTOS = 'components/fiscal/EventosConsolidados.tsx'
const MINHAS = 'app/fiscal/minhas-tarefas/page.tsx'
const FILTRO_MINHAS = 'components/fiscal/MinhasTarefasFiltro.tsx'
const SECAO_MINHAS = 'components/fiscal/MinhasTarefasSecao.tsx'
const DOSSIE = 'components/fiscal/DossieSecao.tsx'
const SECOES_PARC = 'components/fiscal/GerenciarSecoesModal.tsx'
const AGENDA_PAGINA = 'app/fiscal/agenda/page.tsx'
const AGENDA = 'components/geral/agenda/Agenda.tsx'
const DIA = 'components/geral/agenda/DiaModal.tsx'
const PARC_CAB = 'components/fiscal/parcelamentos/ParcelamentosCabecalho.tsx'
const MOVIMENTOS = 'components/financeiro/MovimentoListClient.tsx'
const PROCEDIMENTOS = 'app/societario/procedimentos/page.tsx'
const PREENCHIMENTO = 'components/PreenchimentoRapido.tsx'
const LINKS = 'components/geral/LinksUteis.tsx'
const TAREFAS = 'app/fiscal/tarefas/page.tsx'

const TODOS = [...LISTAS, ...DASHBOARDS, CALENDARIO, EVENTOS, MINHAS, FILTRO_MINHAS, SECAO_MINHAS, DOSSIE, SECOES_PARC,
  AGENDA_PAGINA, AGENDA, DIA, PARC_CAB, MOVIMENTOS, PROCEDIMENTOS, PREENCHIMENTO, LINKS, TAREFAS]

for (const arq of TODOS) {
  test(`${arq}: sem fontes pequenas, sem emoji, sem confirm/alert, sem "Carregando…" solto`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/)
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⏳⚠]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('Carregando…'))
  })
}

for (const [arq, setor] of Object.entries(LISTAS_COM_CARTAO)) {
  test(`${arq}: cartões no celular e tabela de sm para cima (nav-03)`, () => {
    const src = ler(arq)
    tem(src, ['<ul className="flex flex-col gap-2.5 sm:hidden">', '<Card semPadding className="hidden overflow-hidden sm:block">',
      `href={\`/${setor}/clientes/\${cliente.id}\`}`, 'rounded-xl border border-line-soft bg-surface px-4 py-3.5',
      '<NomeCliente nome={cliente.nome} cnpj={cliente.cnpj} />', '<BarraProgresso', 'formatarBadgeVinculo(p).texto'], arq)
  })
}

test('cartões com responsável usam Avatar (Fiscal e Pessoal)', () => {
  for (const arq of ['components/fiscal/ClientesLista.tsx', 'components/pessoal/ClientesListaPessoal.tsx']) {
    tem(ler(arq), ['<Avatar nome={cliente.responsavel} />', 'Sem responsável'], arq)
  }
})

test('Cadastro geral: cartão abre o cadastro e a impressão continua na tabela', () => {
  const src = ler(LISTA_GERAL)
  tem(src, ['<ul className="flex flex-col gap-2.5 sm:hidden print:hidden">', '<Card semPadding className="hidden overflow-hidden sm:block print:block">',
    'onClick={() => setClienteAbertoId(c.id)}', 'setoresDoCliente(c.setores)'])
})

for (const arq of LISTAS) {
  test(`${arq}: botão Filtros no celular, destacado com filtro ativo; vazio com Limpar filtros`, () => {
    const src = ler(arq)
    tem(src, ['SlidersHorizontal', 'aria-expanded={filtrosAbertos}', "className={cn('h-11 w-11 sm:hidden', filtrosAtivos > 0 && 'border-acc text-acc-text')}",
      "filtrosAbertos ? 'flex' : 'hidden'", 'titulo="Nenhum cliente com esses filtros"', 'titulo="Nenhum cliente cadastrado"',
      'onClick={limparFiltros}>Limpar filtros</Button>', 'function limparFiltros()', "setBusca('')"], arq)
    assert.ok(!src.includes('Nenhum cliente encontrado'), arq)
  })
}

test('listas mantêm as chaves de filtro persistente de antes', () => {
  tem(ler('components/fiscal/ClientesLista.tsx'), ["'clientes:busca'", "'clientes:grupo'", "'clientes:atividade'", "'clientes:pendencia'", "'clientes:mostrarDesabilitados'"])
  tem(ler('components/pessoal/ClientesListaPessoal.tsx'), ["'clientes-pessoal:busca'", "'clientes-pessoal:regime'", "'clientes-pessoal:prioridade'"])
  tem(ler(LISTA_CONTABIL), ["'clientes-contabil:busca'", "'clientes-contabil:regime'"])
  tem(ler(LISTA_GERAL), ["'clientesGeral:regimes'", "'clientesGeral:setor'", "'clientesGeral:atividade'"])
})

for (const arq of DASHBOARDS) {
  test(`${arq}: vazios compactos, Ver calendário e KPIs lado a lado no celular (mob-09)`, () => {
    const src = ler(arq)
    const setor = arq.split('/')[1]
    tem(src, ['<div className="grid grid-cols-2 gap-4 md:hidden">', 'Com observação', '{clientesObs.length}', 'hidden md:block',
      'titulo="Nenhum cliente com observação"', "'Nenhum prazo nos próximos 10 dias'", `href="/${setor}/calendario"`, 'Ver calendário',
      'EmptyState compacto icone={<CheckCircle2'], arq)
    assert.ok(!src.includes('Nenhum cliente com observação.</p>'), arq)
  })
}

test('Contábil e Pessoal: Clientes ativos no {Setor}', () => {
  tem(ler('app/contabil/dashboard/page.tsx'), ["'Clientes ativos'", '>no Contábil</p>'])
  tem(ler('app/pessoal/dashboard/page.tsx'), ["'Clientes ativos'", '>no Pessoal</p>'])
})

test('calendário: subtítulo com o setor, vazio que abre a janela existente e erro em Aviso', () => {
  const src = ler(CALENDARIO)
  tem(src, ['`Prazos internos do escritório e vencimentos oficiais do ${SETOR_LABEL[setor]}`', 'titulo="Nenhum prazo cadastrado ainda"',
    'Cadastrar o primeiro prazo', 'onClick={() => setCriando(true)}', '<Aviso tom="dng">', 'eventos.length === 0',
    'rotulo="Mês anterior"', 'rotulo="Próximo mês"', '<CalendarioEventoModal setor={setor} evento={null}'])
  // Setas pelo IconButton (44px no celular), sem tamanho fixo que anule o ajuste.
  assert.doesNotMatch(src, /rotulo="(Mês anterior|Próximo mês)"[^/]*className=/)
})

test('Minhas tarefas: subtítulos do desenho (f-09) e eventos com vazio do mês (f-10)', () => {
  const minhas = ler(MINHAS)
  tem(minhas, ['`Tipos de tarefa atribuídos a ${nomeAlvo}, em todos os clientes`', "'Tipos de tarefa atribuídos a você, em todos os clientes'", 'mes={mes}'])
  assert.ok(!minhas.includes('exclusivamente'))
  const eventos = ler(EVENTOS)
  tem(eventos, ['`Nenhum evento em ${MESES[mes - 1].toLowerCase()}`',
    'Os eventos avulsos criados nas fichas dos clientes aparecem aqui, agrupados por cliente.', 'Limpar busca', 'onClick={() => setSeletorAberto(true)}>Novo evento</Button>'])
  tem(ler(FILTRO_MINHAS), ['aria-controls="filtros-minhas-tarefas"', 'filtrosAtivos > 0'])
  tem(ler(SECAO_MINHAS), ['EmptyState compacto', 'Nenhum cliente com esse filtro'])
  tem(ler(DOSSIE), ['Nenhum cliente com esses filtros', 'Limpar filtros', "setStatusFiltro('TODOS')"])
  tem(ler(SECOES_PARC), ['EmptyState compacto', 'Nenhuma seção cadastrada'])
})

test('agenda: Seus compromissos pessoais (f-15) e vazios compactos', () => {
  tem(ler(AGENDA_PAGINA), ['subtitulo="Seus compromissos pessoais"'])
  tem(ler(AGENDA), ['titulo="Nenhum compromisso hoje"'])
  tem(ler(DIA), ['titulo="Nenhum compromisso neste dia"'])
})

test('parcelamentos no celular: seções em chips com o mesmo filtro (mob-08)', () => {
  const src = ler(PARC_CAB)
  tem(src, ['role="group" aria-label="Seção"', 'sm:hidden', 'onClick={() => onSecao(TODOS)}', 'onClick={() => onSecao(s.nome)}',
    'className="hidden w-full sm:flex sm:w-[240px]"', 'onChange={e => onSecao(e.target.value)}'])
})

test('botões flutuantes sem barra inferior no tablet e abaixo do aviso no celular', () => {
  const mov = ler(MOVIMENTOS)
  const proc = ler(PROCEDIMENTOS)
  for (const src of [mov, proc]) {
    assert.match(src, /fixed [^"]*bottom-\[84px\][^"]*md:bottom-6[^"]*h-\[52px\][^"]*lg:hidden/)
  }
  // O aviso fica em 148px no celular: acima do topo do botão (84 + 52 = 136).
  const toast = ler('components/ui/Toast.tsx')
  assert.ok(toast.includes('bottom-[148px]') && toast.includes('lg:bottom-4'))
  assert.ok(148 > 84 + 52)
})

test('movimentos e procedimentos: Filtros no celular, vazios com Limpar e esqueleto', () => {
  const mov = ler(MOVIMENTOS)
  tem(mov, ['aria-controls="filtros-movimentos"', "ordenacao !== 'lancamento' && 'border-acc text-acc-text'", "!filtrosAbertos && 'max-sm:hidden'",
    'Nenhum lançamento com essa busca', 'Limpar busca'])
  const proc = ler(PROCEDIMENTOS)
  tem(proc, ["statusFiltro !== 'TODOS' && 'border-acc text-acc-text'", 'Nenhum procedimento com esses filtros', 'Limpar filtros',
    '<EsqueletoLinhas', '<EsqueletoCartao'])
})

test('Preenchimento rápido: vazios da grade em EmptyState compacto', () => {
  const src = ler(PREENCHIMENTO)
  tem(src, ['titulo="A grade aparece aqui"', 'compacto'])
  assert.ok(!src.includes('<p className="px-[18px] py-6 text-sm text-fg-3">'))
})

test('Links úteis: título "Editando os links úteis" na edição (m-19)', () => {
  tem(ler(LINKS), ["titulo={editando ? 'Editando os links úteis' : 'Links úteis'}"])
})
