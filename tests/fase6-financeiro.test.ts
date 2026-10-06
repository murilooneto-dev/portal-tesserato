// tests/fase6-financeiro.test.ts — Recebimentos, Pagamentos, janela de lançamento e Relatórios do Financeiro (Fase 6, Frente C).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buscarEmBlocos, datasRecorrentes, datasSeguintesDaSerie, formatarValorComSinal, intervaloDoMes, situacaoPagamento, TAMANHO_BLOCO } from '../lib/financeiro-movimentos'

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

test('datasRecorrentes: mesmo dia em cada mês até dezembro', () => {
  assert.deepEqual(datasRecorrentes('2026-10-05'), ['2026-10-05', '2026-11-05', '2026-12-05'])
  assert.equal(datasRecorrentes('2026-01-15').length, 12)
  assert.deepEqual(datasRecorrentes('2026-12-10'), ['2026-12-10'])
})

test('datasRecorrentes: dia que não existe no mês vira o último dia', () => {
  assert.deepEqual(datasRecorrentes('2026-01-31').slice(0, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  assert.deepEqual(datasRecorrentes('2028-01-30').slice(0, 3), ['2028-01-30', '2028-02-29', '2028-03-30'])
  assert.deepEqual(datasRecorrentes('2100-01-29').slice(0, 2), ['2100-01-29', '2100-02-28'])
})

test('datasRecorrentes: data inválida não gera nada', () => {
  assert.deepEqual(datasRecorrentes(''), [])
  assert.deepEqual(datasRecorrentes('05/10/2026'), [])
  assert.deepEqual(datasRecorrentes('2026-02-30'), [])
})

test('intervaloDoMes: primeiro e último dia do mês', () => {
  assert.deepEqual(intervaloDoMes(10, 2026), { inicio: '2026-10-01', fim: '2026-10-31' })
  assert.deepEqual(intervaloDoMes(2, 2026), { inicio: '2026-02-01', fim: '2026-02-28' })
  assert.deepEqual(intervaloDoMes(2, 2028), { inicio: '2028-02-01', fim: '2028-02-29' })
  assert.deepEqual(intervaloDoMes(12, 2026), { inicio: '2026-12-01', fim: '2026-12-31' })
})

test('situacaoPagamento: a pagar até o dia do vencimento, vencido depois', () => {
  assert.equal(situacaoPagamento({ pago: true, data: '2026-01-01' }, '2026-10-05'), 'pago')
  assert.equal(situacaoPagamento({ data: '2026-01-01' }, '2026-10-05'), 'pago')
  assert.equal(situacaoPagamento({ pago: false, data: '2026-11-05' }, '2026-10-05'), 'a_pagar')
  assert.equal(situacaoPagamento({ pago: false, data: '2026-10-05' }, '2026-10-05'), 'a_pagar')
  assert.equal(situacaoPagamento({ pago: false, data: '2026-10-04' }, '2026-10-05'), 'vencido')
})

test('pagamento previsto: recorrente nasce a pagar, confirma na lista e fica fora do relatório', () => {
  const actions = ler('lib/financeiro-actions.ts')
  for (const t of ['pago: recorrenciaId === null', 'export async function definirPagamentoConfirmado(id: string, pago: boolean)',
    'pago_em: pago ? hojeISO() : null', ".eq('natureza', 'saida')"]) assert.ok(actions.includes(t), t)
  const lista = ler(LISTA)
  for (const t of ['definirPagamentoConfirmado(id, pago)', "rotulo: 'Confirmar pagamento'", "rotulo: 'Desfazer confirmação'",
    'situacaoPagamento(m, hoje)', '>Vencido</Badge>', '>A pagar</Badge>', '>Pago</Badge>', 'a pagar <b']) assert.ok(lista.includes(t), t)
  assert.ok(ler(PAGINAS[1]).includes('pago: r.pago'))
  assert.ok(ler('app/financeiro/relatorios/page.tsx').includes(".eq('pago', true)"))
})

test('páginas buscam tudo em blocos, sem o corte em 200', () => {
  for (const [arq, natureza] of [[PAGINAS[0], 'entrada'], [PAGINAS[1], 'saida']] as const) {
    const src = ler(arq)
    assert.ok(src.includes('buscarEmBlocos'), arq)
    assert.ok(src.includes('.range(inicio, fim)'), arq)
    assert.ok(!src.includes('.limit('), arq)
    assert.ok(src.includes(`.eq('natureza', '${natureza}')`), arq)
    assert.ok(src.includes(`<MovimentoListClient natureza="${natureza}" movimentos={movimentos} mes={mes} ano={ano} hoje={hojeISO()} />`), arq)
    // Só o mês escolhido no seletor do portal.
    for (const t of ['await getMesAno()', 'intervaloDoMes(mes, ano)', ".gte('data', primeiroDia)", ".lte('data', ultimoDia)"]) assert.ok(src.includes(t), `${arq}: ${t}`)
    assert.ok(!src.includes('+ Novo'), arq)
  }
})

test('lista: desenho fn-01 / fn-03', () => {
  const src = ler(LISTA)
  for (const t of ['<Pagina className="pb-24 sm:pb-24 lg:pb-7">', '<CabecalhoPagina', "'Recebimentos' : 'Pagamentos'", "'Novo recebimento' : 'Novo pagamento'",
    'placeholder="Tipo, centro de custo ou observação"', 'sm:w-[360px]', 'sm:w-[230px]', 'rotulo="Ordenar por"',
    'Mais recente lançado', 'Data (mais recente)', 'Data (mais antiga)', 'Maior valor', 'Menor valor',
    "useState<Ordenacao>('lancamento')", 'largura={140}', 'largura={220}', 'largura={ehEntrada ? 150 : 170}', 'largura={56}',
    'Centro de custo', 'Observação', 'rotulo="Editar ou excluir"', "rotulo: 'Editar'", "rotulo: 'Excluir'", 'perigo: true',
    'relative overflow-x-auto xl:overflow-visible', 'Nenhum lançamento ainda', 'Nenhum lançamento com essa busca',
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
  for (const t of ['excluirMovimento(id, natureza, escopo)', 'if (error) { setErroExcluir(error); return }', 'colSpan={6} className="bg-danger-soft"',
    'variante="perigo-solido"', 'Excluir {nomeItem}', 'no valor de', 'role="alert"']) assert.ok(src.includes(t), t)
})

test('pagamento recorrente: caixa em pagamento novo ou ainda sem série, selo e exclusão em série', () => {
  const janela = ler(JANELA)
  for (const t of ["const podeSerRecorrente = natureza === 'saida' && !movimento?.recorrente", 'rotulo="Pagamento recorrente"',
    'tornarRecorrente: podeSerRecorrente && recorrente', 'datasSeguintesDaSerie(data, hojeISO())',
    'recorrente: podeSerRecorrente && recorrente', 'setRecorrente(false)', 'datasRecorrentes(data)', 'lançamentos salvos.']) assert.ok(janela.includes(t), t)
  const lista = ler(LISTA)
  for (const t of ['<Repeat', '>Recorrente</Badge>', "handleExcluir(m.id, 'este_e_proximos')", 'Este e os próximos', 'Só este']) assert.ok(lista.includes(t), t)
  assert.ok(ler(PAGINAS[1]).includes('recorrencia_id'))
  assert.ok(!ler(PAGINAS[0]).includes('recorrencia_id'))
  const actions = ler('lib/financeiro-actions.ts')
  for (const t of ["input.recorrente && input.natureza === 'saida'", "escopo: 'este' | 'este_e_proximos' = 'este'",
    ".eq('recorrencia_id', serie.recorrencia_id).gte('data', serie.data)"]) assert.ok(actions.includes(t), t)
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
    'sm:grid-cols-3', "const COR_ENTRADA = 'text-ok'", "const COR_SAIDA = 'text-danger'",
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

test('datasSeguintesDaSerie: meses depois do pagamento, só de hoje em diante', () => {
  assert.deepEqual(datasSeguintesDaSerie('2026-10-05', '2026-10-06'), ['2026-11-05', '2026-12-05'])
  // pagamento antigo: meses que já passaram não são criados; o que vence hoje entra
  assert.deepEqual(datasSeguintesDaSerie('2026-03-20', '2026-10-06'), ['2026-10-20', '2026-11-20', '2026-12-20'])
  assert.deepEqual(datasSeguintesDaSerie('2026-03-06', '2026-10-06'), ['2026-10-06', '2026-11-06', '2026-12-06'])
  assert.deepEqual(datasSeguintesDaSerie('2026-03-05', '2026-10-06'), ['2026-11-05', '2026-12-05'])
  // o próprio pagamento nunca entra; dezembro e data inválida não geram nada
  assert.deepEqual(datasSeguintesDaSerie('2026-12-10', '2026-10-06'), [])
  assert.deepEqual(datasSeguintesDaSerie('', '2026-10-06'), [])
})

test('tornar recorrente na edição: só pagamento sem série, meses novos a pagar, desfaz se falhar', () => {
  const actions = ler('lib/financeiro-actions.ts')
  const corpo = actions.slice(actions.indexOf('export async function atualizarMovimento'), actions.indexOf('export async function definirPagamentoConfirmado'))
  for (const t of ["input.tornarRecorrente && input.natureza === 'saida'", 'datasSeguintesDaSerie(input.data, hojeISO())',
    ".is('recorrencia_id', null)", 'pago: false', "update({ recorrencia_id: null }).eq('id', input.id)"]) assert.ok(corpo.includes(t), t)
  assert.ok(ler(LISTA).includes('recorrente: Boolean(editando.recorrencia_id)'))
})
