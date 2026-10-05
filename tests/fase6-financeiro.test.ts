// tests/fase6-financeiro.test.ts — Recebimentos, Pagamentos, janela de lançamento e Relatórios do Financeiro (Fase 6, Frente C).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buscarEmBlocos, formatarValorComSinal, TAMANHO_BLOCO } from '../lib/financeiro-movimentos'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const LISTA = 'components/financeiro/MovimentoListClient.tsx'
const JANELA = 'components/financeiro/NovoMovimentoModal.tsx'
const SELETOR = 'components/financeiro/SeletorComBusca.tsx'
const PAGINAS = ['app/financeiro/recebimentos/page.tsx', 'app/financeiro/pagamentos/page.tsx']
const MOVIMENTOS = [LISTA, JANELA, SELETOR, ...PAGINAS]

for (const arq of MOVIMENTOS) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⚠×]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
  })
}

test('buscarEmBlocos junta blocos de 1000 até vir um incompleto', async () => {
  const total = TAMANHO_BLOCO * 2 + 7
  const pedidos: [number, number][] = []
  const linhas = await buscarEmBlocos<number>(async (inicio, fim) => {
    pedidos.push([inicio, fim])
    const data = Array.from({ length: Math.max(0, Math.min(fim + 1, total) - inicio) }, (_, i) => inicio + i)
    return { data, error: null }
  })
  assert.equal(linhas.length, total)
  assert.deepEqual(pedidos, [[0, 999], [1000, 1999], [2000, 2999]])
  await assert.rejects(() => buscarEmBlocos(async () => ({ data: null, error: { message: 'falhou' } })), /falhou/)
})

test('formatarValorComSinal põe o sinal na frente do R$', () => {
  assert.match(formatarValorComSinal(-1750), /^- R\$\s1\.750,00$/)
  assert.match(formatarValorComSinal(250), /^R\$\s250,00$/)
})

test('páginas buscam tudo em blocos, sem o corte em 200', () => {
  for (const [arq, natureza] of [[PAGINAS[0], 'entrada'], [PAGINAS[1], 'saida']] as const) {
    const src = ler(arq)
    assert.ok(src.includes('buscarEmBlocos'), arq)
    assert.ok(src.includes('.range(inicio, fim)'), arq)
    assert.ok(!src.includes('.limit('), arq)
    assert.ok(src.includes(`.eq('natureza', '${natureza}')`), arq)
    assert.ok(src.includes(`<MovimentoListClient natureza="${natureza}" movimentos={movimentos} />`), arq)
    assert.ok(!src.includes('+ Novo'), arq)
  }
})

test('lista: desenho fn-01 / fn-03', () => {
  const src = ler(LISTA)
  for (const t of ['<Pagina>', '<CabecalhoPagina', "'Recebimentos' : 'Pagamentos'", "'Novo recebimento' : 'Novo pagamento'",
    'placeholder="Tipo, centro de custo ou observação"', 'sm:w-[360px]', 'sm:w-[230px]', 'rotulo="Ordenar por"',
    'Mais recente lançado', 'Data (mais recente)', 'Data (mais antiga)', 'Maior valor', 'Menor valor',
    "useState<Ordenacao>('lancamento')", 'largura={140}', 'largura={220}', 'largura={ehEntrada ? 150 : 170}', 'largura={56}',
    'Centro de custo', 'Observação', 'rotulo="Editar ou excluir"', "rotulo: 'Editar'", "rotulo: 'Excluir'", 'perigo: true',
    'relative overflow-x-auto xl:overflow-visible', 'Nenhum lançamento ainda.', 'Nenhum lançamento encontrado com esse filtro.',
    '<EmptyState', 'POR_PAGINA = 50', 'Mostrando ${inicio + 1}–${inicio + visiveis.length} de ${n} lançamentos',
    'fixed right-4 bottom-[84px]', 'h-[52px] rounded-[26px]', 'shadow-lg lg:hidden']) assert.ok(src.includes(t), t)
  assert.match(src, /<Card semPadding className="[^"]*overflow-hidden[^"]*">/)
  // Valor em cor neutra: nada de verde/vermelho na coluna.
  assert.doesNotMatch(src, /text-(ok|emerald|red)[\s"'-]/)
  // O total do celular não é "do mês": a lista não filtra por mês.
  assert.ok(!src.includes('Total do mês'))
})

test('lista: excluir confirma na linha e mostra o erro da action', () => {
  const src = ler(LISTA)
  for (const t of ['excluirMovimento(id, natureza)', 'if (error) { setErroExcluir(error); return }', 'colSpan={6} className="bg-danger-soft"',
    'variante="perigo-solido"', 'Excluir {nomeItem}', 'no valor de', 'role="alert"']) assert.ok(src.includes(t), t)
})

test('lista: abre a janela com os mesmos dados de antes', () => {
  const src = ler(LISTA)
  for (const t of ['<NovoMovimentoModal natureza={natureza} onClose={() => setModalAberto(false)} />', 'id: editando.id', 'tipoId: editando.tipo_id',
    'tipoNome: editando.tipo_nome', 'centroCustoId: editando.centro_custo_id', 'centroCustoNome: editando.centro_custo_nome',
    'valor: editando.valor', 'data: editando.data', 'observacao: editando.observacao']) assert.ok(src.includes(t), t)
})

test('janela m-16: desenho e textos', () => {
  const src = ler(JANELA)
  for (const t of ['largura="p"', 'subtitulo="Financeiro"', 'fecharAoClicarFora={false}', '<Aviso tom="ok">', '<b>Lançamento salvo.</b>',
    'Os campos foram limpos para o próximo; a data foi mantida.', 'rotulo="Data" obrigatorio', 'rotulo="Valor" obrigatorio',
    'placeholder="R$ 0,00"', "'Novo tipo'", "'Novo centro'", 'placeholder="Buscar ou escolher"', 'placeholder="Nenhum"',
    'placeholder="Opcional"', 'Nenhum tipo cadastrado ainda.', '>Limpar<', '>Fechar<', "'Salvar e lançar outro'", '>Cancelar<',
    '<Aviso tom="dng">{erro}</Aviso>', 'erro={erroTipo}', 'erro={erroCentro}',
    "'Editar recebimento' : 'Editar pagamento'", "'Novo recebimento' : 'Novo pagamento'"]) assert.ok(src.includes(t), t)
  // Data e Valor vêm antes de Tipo, que vem antes de Centro de custo e Observação.
  const ordem = ['rotulo="Data"', 'rotulo="Valor"', 'rotulo="Tipo"', 'rotulo="Centro de custo"', 'rotulo="Observação"'].map(t => src.indexOf(t))
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem)
})

test('janela: actions com os mesmos argumentos e o mesmo fluxo', () => {
  const src = ler(JANELA)
  for (const t of ['listarFinanceiroTiposAtivos(natureza)', 'listarFinanceiroCentrosCustoAtivos(natureza)',
    'criarFinanceiroTipo(natureza, novoTipoNome)', 'criarFinanceiroCentroCusto(natureza, novoCentroNome)',
    "Number(valor.replace(',', '.'))", 'ativo: false', 'router.refresh()', 'limparParaProximo()', 'setSucesso(true)']) assert.ok(src.includes(t), t)
  const corpo = 'natureza,\n          tipoId,\n          centroCustoId: centroCustoId || null,\n          valor: valorNumerico,\n          data,\n          observacao: observacao.trim() || null,'
  const semCr = src.replace(/\r/g, '')
  assert.ok(semCr.includes(`atualizarMovimento({\n          id: movimento.id,\n          ${corpo}`))
  assert.ok(semCr.includes(`criarMovimento({\n          ${corpo}`))
})

test('seletor com busca: lupa, seta, linhas de 44px e escolhido em destaque', () => {
  const src = ler(SELETOR)
  for (const t of ['<Search', '<ChevronDown', 'min-h-11', 'bg-acc-soft', 'role="combobox"', 'role="listbox"', 'Nenhum resultado',
    "onChange('')", "e.key === 'Escape'", 'bottom-full']) assert.ok(src.includes(t), t)
})

const REL_PAGINA = 'app/financeiro/relatorios/page.tsx'
const REL_CLIENTE = 'app/financeiro/relatorios/RelatoriosFinanceiroClient.tsx'

for (const arq of [REL_PAGINA, REL_CLIENTE]) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⚠×]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
  })
}

test('relatório: busca em blocos com os mesmos filtros, sem o corte em 1000', () => {
  const src = ler(REL_PAGINA)
  for (const t of ['buscarEmBlocos', '.range(inicio, fim)', ".order('data', { ascending: false })", ".eq('natureza', natureza)",
    ".eq('tipo_id', tipoId)", ".eq('centro_custo_id', centroCustoId)", ".gte('data', de)", ".lte('data', ate)",
    'tiposEntrada={tiposEntrada ?? []}', 'tiposSaida={tiposSaida ?? []}', 'centrosCusto={centrosCusto ?? []}']) assert.ok(src.includes(t), t)
  assert.ok(!src.includes('.limit('))
  // Só leitura.
  assert.doesNotMatch(src, /\.(insert|update|delete|upsert)\(/)
})

test('relatório: desenho fn-02', () => {
  const src = ler(REL_CLIENTE)
  for (const t of ['titulo="Relatórios"', 'subtitulo="Entradas e saídas no período escolhido"', '<Printer', 'Imprimir ou salvar PDF',
    'window.print()', 'hidden print:block', 'rotulo="Natureza"', 'rotulo="Tipo"', 'rotulo="Centro de custo"', 'rotulo="De"', 'rotulo="Até"',
    'sm:w-[130px]', 'sm:w-[160px]', 'sm:w-[150px]', '<Filter', 'Aplicar filtros', '>Limpar<',
    "label: 'Entradas'", "label: 'Saídas'", "label: 'Saldo'", 'saldo < 0 ? COR_SAIDA : COR_ENTRADA', 'formatarValorComSinal(saldo)',
    'sm:grid-cols-3', 'text-ok print:text-emerald-700', 'text-danger print:text-red-700',
    '<Badge tom="ok" icone={<ArrowDownLeft', '<Badge tom="dng" icone={<ArrowUpRight',
    'w-[130px]', 'w-[200px]', 'w-[180px]', 'w-[190px]', 'relative overflow-x-auto xl:overflow-visible',
    'formatarValorComSinal(-m.valor)', '<EmptyState', 'Nenhum registro', 'sm:hidden print:hidden']) assert.ok(src.includes(t), t)
  assert.match(src, /<Card semPadding className="[^"]*overflow-hidden[^"]*">/)
  // Sem a coluna "#".
  assert.ok(!src.includes('>#<'))
})

test('relatório: filtros continuam na URL e o Tipo depende da natureza', () => {
  const src = ler(REL_CLIENTE)
  for (const t of ["params.set('natureza', form.natureza)", "params.set('tipoId', form.tipoId)", "params.set('centroCustoId', form.centroCustoId)",
    "params.set('de', form.de)", "params.set('ate', form.ate)", 'router.push(`/financeiro/relatorios?${params.toString()}`)',
    "router.push('/financeiro/relatorios')", "natureza: e.target.value, tipoId: ''",
    "form.natureza === 'saida' ? tiposSaida : form.natureza === 'entrada' ? tiposEntrada : [...tiposEntrada, ...tiposSaida]"]) assert.ok(src.includes(t), t)
})
