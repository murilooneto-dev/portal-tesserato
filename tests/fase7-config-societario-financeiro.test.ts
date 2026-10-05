// tests/fase7-config-societario-financeiro.test.ts — Configurações do Societário e do Financeiro (Fase 7, Frente B).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')

const SOC = 'app/admin/configuracoes/societario'
const FIN = 'app/admin/configuracoes/financeiro'
const SOC_CASCA = `${SOC}/SocietarioConfigClient.tsx`
const PROCESSOS = `${SOC}/ProcessosTab.tsx`
const DOCS = `${SOC}/DocumentacoesTab.tsx`
const SOC_TAREFAS = `${SOC}/TarefasSocietarioTab.tsx`
const SOC_VINCULAR = `${SOC}/VincularClientesModal.tsx`
const FIN_CASCA = `${FIN}/FinanceiroConfigClient.tsx`
const CATALOGO = `${FIN}/FinanceiroCatalogoTab.tsx`
const FIN_TAREFAS = `${FIN}/TarefasFinanceiroTab.tsx`
const FIN_VINCULAR = `${FIN}/VincularClientesModal.tsx`
const TODOS = [SOC_CASCA, PROCESSOS, DOCS, SOC_TAREFAS, SOC_VINCULAR, FIN_CASCA, CATALOGO, FIN_TAREFAS, FIN_VINCULAR]

const contem = (src: string, trechos: string[]) => { for (const t of trechos) assert.ok(src.includes(t), t) }

for (const arq of TODOS) {
  test(`${arq}: regras de qualidade`, () => {
    const src = ler(arq)
    // Nada abaixo de 12px.
    assert.doesNotMatch(src, /text-\[(\d|1[01])px\]/)
    // Só as cores do tema novo.
    assert.ok(!src.includes('[var(--fg)]'))
    assert.ok(!src.includes('var(--accent'))
    assert.ok(!src.includes('var(--bg-surface)'))
    // Sem emoji nem símbolo no lugar de ícone.
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⚠×▲▼]/u)
    // Sem confirm()/alert() do navegador e sem fundo de janela feito à mão.
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('fixed inset-0'))
    // Texto de botão sem o "+" digitado.
    assert.doesNotMatch(src, /['">]\+ /)
  })
}

test('cascas: caminho, título, subtítulo e abas', () => {
  const soc = ler(SOC_CASCA)
  contem(soc, ['<Pagina>', "{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: 'Societário' }",
    'titulo="Configurações do Societário"', 'subtitulo="Tipos de processo, modelos de documentação e tarefas"', '<Abas',
    "rotulo: 'Tipos de processo', conteudo: <ProcessosTab />", "rotulo: 'Documentações', conteudo: <DocumentacoesTab />",
    "rotulo: 'Tarefas', conteudo: <TarefasSocietarioTab />"])
  assert.ok(!soc.includes("'Processos'"))

  const fin = ler(FIN_CASCA)
  contem(fin, ['<Pagina>', "{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: 'Financeiro' }",
    'titulo="Configurações do Financeiro"', 'subtitulo="Tipos, centros de custo e tarefas do Financeiro"', '<Abas',
    `rotulo: 'Tipos de entrada', conteudo: <FinanceiroCatalogoTab tipo="tipos" natureza="entrada" label="tipo de entrada" />`,
    `rotulo: 'Tipos de saída', conteudo: <FinanceiroCatalogoTab tipo="tipos" natureza="saida" label="tipo de saída" />`,
    `rotulo: 'Centros de custo · recebimento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="entrada" label="centro de custo de recebimento" mostrada={trocas} />`,
    `rotulo: 'Centros de custo · pagamento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="saida" label="centro de custo de pagamento" mostrada={trocas} />`,
    "rotulo: 'Tarefas', conteudo: <TarefasFinanceiroTab />"])
  // As cinco abas aparecem nessa ordem.
  const ordem = ["'Tipos de entrada'", "'Tipos de saída'", "'Centros de custo · recebimento'", "'Centros de custo · pagamento'", "'Tarefas'"].map(t => fin.indexOf(t))
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem)
})

test('tipos de processo: desenho a-04', () => {
  const src = ler(PROCESSOS)
  contem(src, ['lg:grid-cols-[minmax(0,1fr)_420px]', 'grid-cols-1', 'gap-5',
    "'Editar tipo de processo' : 'Novo tipo de processo'", 'rotulo="Nome do tipo de processo" obrigatorio',
    'Etapas ({etapasAtuais.length})', 'bg-page', 'rotulo="Remover etapa"', 'border-l-2 border-line pl-3.5',
    '<Segmentado', "{ valor: 'texto', rotulo: 'Texto e anexo' }", "{ valor: 'checklist', rotulo: 'Sim ou não' }", "{ valor: 'data', rotulo: 'Data' }",
    'rotulo={`Remover subetapa ${sub.nome}`}', 'placeholder="Nome da subetapa"', '>Subetapa</Button>',
    'placeholder="Nome da nova etapa"', '>Adicionar etapa</Button>', 'border-t border-line-soft pt-3.5',
    "'Criar tipo de processo'", "'Salvar'", '>Cancelar</Button>',
    '<Card titulo="Tipos cadastrados" semPadding>', "etapa{item.etapas.length === 1 ? '' : 's'}", '<Pencil', 'rotulo={`Excluir ${item.nome}`}',
    '<EmptyState', 'Nenhum tipo de processo cadastrado ainda', '<Aviso tom="dng">{erro}</Aviso>'])
  // "Sim ou não" é só rótulo: o valor checklist não some.
  assert.ok(!src.includes("'Checklist'"))
})

test('tipos de processo: mesmas actions, mesmos argumentos, nada de função perdida', () => {
  const src = ler(PROCESSOS)
  contem(src, ['listarProcessoTipos()', 'criarProcessoTipo(novoNome, etapas)', 'excluirProcessoTipo(item.id)',
    'moverSubetapaOrdem(subetapaId, direcao)', 'atualizarProcessoTipo(editandoId, nomeEdicao, etapasEdicao)',
    'if (!novoNome.trim() || etapas.length === 0) return', 'if (!editandoId || !nomeEdicao.trim() || etapasEdicao.length === 0) return',
    'setEtapasEdicao(paraEtapaForm(item))', 'adicionarEtapa(prev, novaEtapa)', 'adicionarEtapa(prev, novaEtapaEdicao)',
    'removerEtapa(prev, i)', 'renomearEtapa(prev, i, novoNome)', 'adicionarSubetapa(prev, i, nome, tipoResposta)',
    'removerSubetapa(prev, i, subetapaIndex)', 'moverSubetapa(prev, i, subetapaIndex, direcao)',
    'editarSubetapa(prev, i, subetapaIndex, nome, tipoResposta)',
    // Linha expansível com selo de formato e reordenação das subetapas já salvas.
    'aria-expanded={aberto}', "moverPersistida(sub.id, 'up')", "moverPersistida(sub.id, 'down')", 'labelFormato(sub.tipoResposta)',
    // Nome e formato da subetapa continuam editáveis na linha.
    'onEditarSubetapa(i, e.target.value, sub.tipoResposta)', 'onEditarSubetapa(i, sub.nome, v)',
    'useConfirmar()', 'Excluir o tipo de processo "${item.nome}"?'])
})

test('documentações: desenho a-14 e mesmas actions', () => {
  const src = ler(DOCS)
  contem(src, ['<Card titulo="Novo modelo de documentação">', 'items-end', 'rotulo="Nome do modelo" obrigatorio',
    'placeholder="Ex.: Contrato social padrão"', 'rotulo="Arquivo"', '<Upload', 'Escolher arquivo', "'Criar modelo'",
    'accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"', '.pdf, .docx, .xls, .xlsx, .png ou .jpg',
    '{arquivo.name} ({formatarTamanho(arquivo.size)})',
    '<Th>Modelo</Th>', '<Th largura={140}>Tamanho</Th>', '<Th largura={56}>', 'tabular-nums', '<FileText',
    'href={`/api/arquivos/documentacao/${item.id}`}', 'target="_blank"', 'rel="noopener noreferrer"',
    'rotulo={`Excluir modelo ${item.nome}`}', 'Nenhum modelo de documentação cadastrado ainda',
    'listarDocumentacaoModelos()', "formData.append('arquivo', arquivo)", 'criarDocumentacaoModelo(novoNome, formData)',
    'excluirDocumentacaoModelo(item.id)', 'if (!novoNome.trim() || !arquivo || salvando) return',
    'Excluir o modelo de documentação "${item.nome}"?'])
  assert.match(src, /<Card semPadding className="[^"]*overflow-hidden[^"]*">/)
})

for (const [arq, setor, nome] of [[SOC_TAREFAS, 'societario', 'TarefasSocietarioTab'], [FIN_TAREFAS, 'financeiro', 'TarefasFinanceiroTab']] as const) {
  test(`${arq}: desenho a-15 e mesmas actions`, () => {
    const src = ler(arq)
    contem(src, [`export default function ${nome}()`,
      'flex flex-wrap items-end gap-3', '<Field rotulo="Nome" className="min-w-[14rem] flex-1">', 'placeholder="Nome da nova tarefa"',
      'Criar tarefa', "if (e.key === 'Enter') abrirCriacao()",
      'relative overflow-x-auto xl:overflow-visible', '<Th>Tarefa</Th>', '<Th largura={150}>Periodicidade</Th>',
      '<Th largura={280}>Responsável exclusivo</Th>', '<Th largura={170}>', '<Th largura={56}>',
      '<Badge tom="neu">{LABEL_PERIODICIDADE[periodicidadeDosMesesVisiveis(item.mesesVisiveis)]}</Badge>',
      "mensal: 'Mensal'", "bimestral: 'Bimestral'", "trimestral: 'Trimestral'", "semestral: 'Semestral'", "anual: 'Anual'",
      '<option value="">Ninguém (regra normal)</option>', 'title="Responsável exclusivo por esse tipo de tarefa, em todos os clientes"',
      '<Users', 'Vincular clientes', 'rotulo={`Editar ou excluir ${item.nome}`}', "rotulo: 'Editar'", "rotulo: 'Excluir'", 'perigo: true',
      "avisar('Salvo', 'ok')", "'text-fg-3 line-through'", '<EmptyState', '<Aviso tom="dng">{erro}</Aviso>',
      // Actions e janelas com os mesmos argumentos de antes.
      `listarTarefaTiposDoSetor('${setor}')`, `listarUsuariosDoSetor('${setor}')`,
      "const valor = responsavelId === '' ? null : responsavelId", 'atualizarResponsavelTarefaTipo(item.id, valor)',
      'excluirTarefaTipo(item.id)', 'nome={novoNome}', `setor="${setor}"`, 'padrao={true}',
      'id={editando.id}', 'nome={editando.nome}', 'tipoResposta={editando.tipoResposta}', 'etapas={editando.etapas}',
      'mesesVisiveis={editando.mesesVisiveis}', 'tarefaTipoId={vinculando.id}', 'tarefaTipoNome={vinculando.nome}',
      'Excluir a tarefa "${item.nome}"?', 'remove também os vínculos dela com clientes'])
    assert.match(src, /<Card semPadding className="[^"]*overflow-hidden[^"]*">/)
    assert.equal(src.split(`setor="${setor}"`).length - 1, 2)
  })
}

test('as abas Tarefas do Societário e do Financeiro são a mesma tela', () => {
  const igualar = (s: string) => s.replace(/societario/g, 'X').replace(/financeiro/g, 'X').replace(/Societario/g, 'Y').replace(/Financeiro/g, 'Y')
  assert.equal(igualar(ler(SOC_TAREFAS)), igualar(ler(FIN_TAREFAS)))
  assert.equal(igualar(ler(SOC_VINCULAR)), igualar(ler(FIN_VINCULAR)))
})

for (const [arq, setor] of [[SOC_VINCULAR, 'societario'], [FIN_VINCULAR, 'financeiro']] as const) {
  test(`${arq}: janela de clientes`, () => {
    const src = ler(arq)
    contem(src, [`from '@/lib/tarefa-tipo-vinculos-${setor}-actions'`, '<Modal', 'largura="p"',
      'titulo={`Clientes de "${tarefaTipoNome}"`}', 'placeholder="Buscar cliente"', '<Search', '<Checkbox',
      'Vincular agora não cria pendências de meses/períodos passados — só a partir do período atual.',
      'variante="fantasma" onClick={onClose}', '>Fechar</Button>', 'Nenhum cliente encontrado',
      'listarClientesParaVinculo()', 'listarClienteIdsVinculados(tarefaTipoId)',
      'alternarVinculoCliente(tarefaTipoId, clienteId, !jaVinculado)',
      'c.nome.toLowerCase().includes(busca.trim().toLowerCase())'])
    // Se a action falhar, a marcação volta ao que era.
    assert.equal(src.split('const novo = new Set(prev)').length - 1, 2)
  })
}

test('catálogos do Financeiro: desenho a-05 e mesmas actions', () => {
  const src = ler(CATALOGO)
  contem(src, ['flex flex-wrap items-end gap-3', '<Field rotulo="Nome" className="min-w-[14rem] flex-1">',
    'placeholder={`Nome do novo ${label}`}', "ehCentro ? 'Criar centro de custo' : 'Criar tipo'", "if (e.key === 'Enter') handleCriar()",
    'relative overflow-x-auto xl:overflow-visible', '<Th>{tituloColuna}</Th>', "ehCentro ? 'Centro de custo'",
    '<Th largura={160}>Situação</Th>', '<Th largura={56}>', '<Badge tom="ok">Ativo</Badge>', '<Badge tom="neu">Desativado</Badge>',
    "'text-fg-3 line-through'", 'rotulo={`Renomear, desativar ou excluir ${item.nome}`}', "rotulo: 'Renomear'",
    "rotulo: item.ativo ? 'Desativar' : 'Ativar'", "rotulo: 'Excluir'", 'perigo: true',
    "if (e.key === 'Enter') handleRenomear(item.id)", '(sem categoria — item antigo)', 'ehCentro && !item.natureza',
    '<EmptyState', '<Aviso tom="dng">{erro}</Aviso>', 'Excluir "${item.nome}"?',
    'await listarFinanceiroTipos(natureza)', 'await listarFinanceiroCentrosCusto(natureza)', 'ordenarPorNome(data)',
    'await criarFinanceiroTipo(natureza, novoNome)', 'await criarFinanceiroCentroCusto(natureza, novoNome)',
    'await renomearFinanceiroTipo(id, nomeEditado)', 'await renomearFinanceiroCentroCusto(id, nomeEditado)',
    'await alternarAtivoFinanceiroTipo(item.id, !item.ativo)', 'await alternarAtivoFinanceiroCentroCusto(item.id, !item.ativo)',
    'await excluirFinanceiroTipo(item.id)', 'await excluirFinanceiroCentroCusto(item.id)'])
  assert.match(src, /<Card semPadding className="[^"]*overflow-hidden[^"]*">/)
  // Aqui não existe "Vincular tarefas".
  assert.ok(!src.includes('Vincular'))
})
