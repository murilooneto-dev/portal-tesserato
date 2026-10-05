// tests/fase5-final-fichas.test.ts — fichas do cliente do Contábil e do Pessoal no desenho novo (Fase 5 final).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const PAGINAS = {
  contabil: 'app/contabil/clientes/[id]/page.tsx',
  pessoal: 'app/pessoal/clientes/[id]/page.tsx',
} as const
const CHECKLISTS = {
  contabil: 'components/contabil/TarefaChecklistContabil.tsx',
  pessoal: 'components/pessoal/TarefaChecklistPessoal.tsx',
} as const
const ACOES = {
  contabil: 'components/contabil/ClienteContabilAcoes.tsx',
  pessoal: 'components/pessoal/ClientePessoalAcoes.tsx',
} as const
const ARQUIVOS = [
  ...Object.values(PAGINAS), ...Object.values(CHECKLISTS), ...Object.values(ACOES),
  'components/geral/ClienteNotas.tsx', 'components/geral/MenuMaisAcoes.tsx', 'components/geral/AbasFichaSetor.tsx',
]

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fonte < 12px, sem [var(--fg)], sem emoji, sem confirm()/alert()`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'), 'tokens novos, não [var(--fg)]')
    assert.doesNotMatch(src, /[⚠⏱📎▶]/u, 'sem emoji/símbolo antigo na UI')
    assert.doesNotMatch(src, /(^|[^.\w])confirm\(/m)
    assert.doesNotMatch(src, /(^|[^.\w])alert\(/m)
  })
}

for (const [setor, arq] of Object.entries(PAGINAS)) {
  test(`ficha ${setor}: Pagina, trilha, cabeçalho com Badge/avatar e duas colunas com abas no celular`, () => {
    const src = ler(arq)
    assert.ok(src.includes('<Pagina>'), 'Pagina')
    assert.ok(!src.includes('max-w-4xl') && !src.includes('p-8'), 'sem moldura antiga')
    assert.ok(src.includes('aria-label="Caminho"') && src.includes(`href="/${setor}/clientes"`), 'trilha Clientes › nome')
    assert.ok(src.includes('<CabecalhoPagina'), 'cabeçalho comum')
    assert.ok(src.includes('<Badge tom="acc">{labelRegime(cliente.regime)}</Badge>'), 'regime em Badge')
    assert.ok(src.includes('corResponsavel'), 'avatar do responsável com a cor do usuário')
    assert.ok(src.includes('<AbasFichaSetor') && src.includes('abas={ABAS_FICHA}'), 'duas colunas / abas no celular')
    for (const chave of ["chave: 'tarefas'", "chave: 'eventos'", "chave: 'observacoes'", "chave: 'historico'"]) {
      assert.ok(src.includes(chave), chave)
    }
    assert.ok(!src.includes('Visualizando'), 'sem a pílula redundante "Visualizando mês/ano"')
    assert.ok(src.includes('<Aviso tom="warn"') && src.includes('Este cliente possui parcelamento'), 'aviso de parcelamento com Aviso')
    assert.ok(src.includes('seletorMes={<SeletorMesFicha'), 'seletor de mês no título do cartão das tarefas')
    assert.ok(src.includes('podeDesabilitar={podeDesabilitar}'), 'menu ⋯ recebe a permissão de desabilitar')
    assert.ok(src.includes("includes('societario')"), 'desabilitar: só Admin e Societário (regra do Cadastro)')
  })
}

test('fichas: server actions chamadas com os mesmos argumentos', () => {
  for (const [setor, arq] of Object.entries(PAGINAS)) {
    const src = ler(arq)
    const toggle = setor === 'contabil' ? 'toggleTarefaContabil' : 'toggleTarefaPessoal'
    for (const chamada of [
      `await ${toggle}(id, tipo, mes, ano, concluida, data)`,
      'await marcarSemMovimento(id, tipo, mes, ano, semMovimento)',
      'await atualizarEtapa(id, mes, ano, tipo, etapaNome, concluida, data)',
      'await salvarRespostaTexto(id, tipo, mes, ano, texto)',
      'return await uploadArquivoTarefa(id, tipo, mes, ano, formData)',
      'await excluirArquivoTarefa(arquivoId)',
      'adicionarNota={adicionarNotaCliente} editarNota={editarNotaCliente} excluirNota={excluirNotaCliente}',
    ]) assert.ok(src.includes(chamada), `${arq}: ${chamada}`)
  }
})

for (const [setor, arq] of Object.entries(CHECKLISTS)) {
  test(`checklist ${setor}: linhas num cartão só, caixa de marcar, "Sem movimento" uma vez, grupo "x de y"`, () => {
    const src = ler(arq)
    assert.ok(!src.includes('rounded-xl border transition-all'), 'sem cartão por tarefa')
    assert.ok(!src.includes('w-2 h-2 rounded-full'), 'sem bolinha')
    assert.ok(!src.includes('SEM MOVIMENTO'), 'sem o selo duplicado em caixa alta')
    assert.ok(src.includes('mostrarCheckboxSemMovimento ? ('), 'caixa OU selo, nunca os dois')
    assert.ok(src.includes('onChange={e => handleHoje(tipo, e.target.checked)}'), 'caixa de marcar na linha')
    assert.ok(src.includes('{concluidasDoGrupo} de {tarefasDoGrupo.length}'), 'grupo "0 de 3"')
    assert.ok(src.includes('renderLinhaTarefa(t, true)'), 'subtarefas recuadas')
    assert.ok(src.includes('sm:grid-cols-2'), 'etapas em grade 2×2 no desktop')
    assert.ok(src.includes('role="progressbar"'), 'barra de progresso no cabeçalho do cartão')
    assert.ok(src.includes('{seletorMes}'), 'seletor de mês no título')
    // handlers iguais
    for (const h of [
      'onToggleSimples(tipo, true, iso)', 'onToggleSimples(tipo, false)',
      'onAtualizarEtapa(tipo, etapaNome, true, iso)', 'onAtualizarEtapa(tipo, etapaNome, false)',
      'onMarcarSemMovimento(tipo, novo)', 'onSalvarTexto(tipo, valor)', 'onUploadArquivo(tipo, formData)', 'onExcluirArquivo(arquivoId)',
    ]) assert.ok(src.includes(h), h)
  })
}

test('checklist do Pessoal mantém o filtro de meses visíveis', () => {
  const src = ler(CHECKLISTS.pessoal)
  assert.ok(src.includes('tarefaVisivelNoMes(tarefaTipos[tipo]?.mesesVisiveis, mes)'))
  assert.ok(src.includes('return tarefasVisiveis.map(tipo => {'))
})

for (const [setor, arq] of Object.entries(ACOES)) {
  test(`ações ${setor}: "Editar dados" + menu ⋯ com Desabilitar (janela existente) e Excluir`, () => {
    const src = ler(arq)
    assert.ok(src.includes('Editar dados'))
    assert.ok(src.includes('<MenuMaisAcoes'))
    assert.ok(src.includes('<DesabilitarClienteModal'), 'janela de desabilitar já existente')
    assert.ok(src.includes('desabilitarClienteGeral(cliente.id, senha)'), 'mesma action do Cadastro de clientes')
    assert.ok(src.includes("rotulo: 'Excluir'") && src.includes('<ConfirmarExclusaoClienteModal'))
    const excluir = setor === 'contabil' ? 'excluirClienteContabil(cliente.id)' : 'excluirClientePessoal(cliente.id)'
    assert.ok(src.includes(excluir), excluir)
  })
}

test('Observações: Card, Field/Textarea, Button e as mesmas actions', () => {
  const src = ler('components/geral/ClienteNotas.tsx')
  for (const t of ['<Card titulo="Observações"', '<Field', '<Textarea', '<Button']) assert.ok(src.includes(t), t)
  assert.ok(src.includes('adicionarNota(clienteId, novoTexto)'))
  assert.ok(src.includes('editarNota(notaId, clienteId, textoEdicao)'))
  assert.ok(src.includes('excluirNota(notaId, clienteId)'))
})
