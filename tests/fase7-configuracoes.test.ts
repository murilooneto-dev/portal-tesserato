// tests/fase7-configuracoes.test.ts — Configurações (início + Fiscal/Contábil/Pessoal), janelas de tipo de tarefa e Lixeira (Fase 7, Frente A).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')

const INICIO = 'app/admin/configuracoes/page.tsx'
const SETOR = 'app/admin/configuracoes/_tarefas/SetorConfigClient.tsx'
const ENTIDADES = 'app/admin/configuracoes/_tarefas/EntidadeListaTab.tsx'
const TAREFAS = 'app/admin/configuracoes/_tarefas/TarefasTab.tsx'
const VINCULAR = 'app/admin/configuracoes/_tarefas/VincularTarefasModal.tsx'
const EDITAR = 'components/geral/EditarTipoTarefaModal.tsx'
const NOVO = 'components/geral/NovoTipoTarefaModal.tsx'
const LIXEIRA = 'app/admin/lixeira/LixeiraClient.tsx'
const LIXEIRA_PAGINA = 'app/admin/lixeira/page.tsx'
const TODOS = [INICIO, SETOR, ENTIDADES, TAREFAS, VINCULAR, EDITAR, NOVO, LIXEIRA, LIXEIRA_PAGINA]

const tem = (src: string, textos: string[]) => { for (const t of textos) assert.ok(src.includes(t), t) }

for (const arq of TODOS) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert, sem overlay próprio`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.ok(!src.includes('var(--accent)'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⚠×]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('fixed inset-0'))
  })
}

test('início a-01: cartões por setor, mantendo o filtro de permissão', () => {
  const src = ler(INICIO)
  tem(src, ['<Pagina>', 'titulo="Configurações"', 'subtitulo="Escolha o setor que você quer configurar"',
    "podeAcessarPagina(profile, 'configuracoes', area.slug)", ".select('role, setores, paginas_acesso')",
    'grid-cols-1', 'lg:grid-cols-3', 'gap-4', 'px-[22px] py-5', 'h-11 w-11', 'rounded-[11px]', 'bg-acc-soft text-acc-text',
    '<Icone size={22} />', 'text-[17px] font-semibold', 'text-[13px] text-fg-3', '<ChevronRight size={20}',
    'Tipos de processo, documentações e tarefas', 'Tipos de entrada e saída, centros de custo e tarefas',
    'Icone: FileText', 'Icone: CreditCard', 'Icone: Users', 'Icone: Building2', 'Icone: ArrowDownLeft'])
  assert.equal(src.split("desc: 'Regimes, atividades e tarefas'").length - 1, 3)
  for (const s of ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']) assert.ok(src.includes(`href: '/admin/configuracoes/${s}', slug: '${s}'`), s)
  assert.ok(!src.includes('Tabelas'))
})

test('setor a-02: caminho, título e abas', () => {
  const src = ler(SETOR)
  tem(src, ["{ rotulo: 'Configurações', href: '/admin/configuracoes' }", 'titulo={`Configurações do ${nomeSetor}`}',
    'subtitulo={`Regimes, atividades e tarefas usados nos clientes do ${nomeSetor}`}', '<Abas',
    "rotulo: 'Regimes'", "rotulo: 'Atividades'", "rotulo: 'Tarefas'",
    '<EntidadeListaTab tabela="regimes" entidadeTipoVinculo="regime" setor={setor} label="Regime" />',
    '<EntidadeListaTab tabela="atividades" entidadeTipoVinculo="atividade" setor={setor} label="Atividade" />',
    '<TarefasTab setor={setor} />'])
})

test('regimes e atividades: linha de criação, tabela e menu de ações', () => {
  const src = ler(ENTIDADES)
  tem(src, ['<div className="flex flex-wrap items-end gap-3">', '<Field rotulo="Nome" className="min-w-[14rem] flex-1">',
    '`Nome da nova ${nomeMinusculo}`', '`Nome do novo ${nomeMinusculo}`', 'variante="primario" icone={<Plus size={16}', 'Criar {nomeMinusculo}',
    "if (e.key === 'Enter') handleCriar()", '<Card semPadding className="overflow-hidden">', 'relative overflow-x-auto xl:overflow-visible',
    '<Th>{label}</Th>', '<Th largura={160}>Situação</Th>', '<Th largura={220}>', '<Th largura={56}>',
    '<Badge tom="ok">Ativo</Badge>', '<Badge tom="neu">Desativado</Badge>', "'text-fg-3 line-through'",
    '<Link2 size={15}', 'Vincular tarefas', 'rotulo={`Renomear, desativar ou excluir ${item.nome}`}',
    "rotulo: 'Renomear'", "rotulo: item.ativo ? 'Desativar' : 'Ativar'", "rotulo: 'Excluir'", 'perigo: true',
    "if (e.key === 'Enter') handleRenomear(item.id)", 'titulo: `Excluir "${item.nome}"?`', "descricao: 'Essa ação não pode ser desfeita.'",
    '<Aviso tom="dng">{erro}</Aviso>', '<EmptyState'])
  // A nota azul do mockup é anotação do desenho, não vai para a tela.
  assert.ok(!src.includes('tom="info"'))
})

test('regimes e atividades: actions com os mesmos argumentos', () => {
  const src = ler(ENTIDADES)
  tem(src, ['listarEntidades(tabela, setor)', 'ordenarPorNome(data)', 'criarEntidade(tabela, setor, novoNome)',
    'renomearEntidade(tabela, id, nomeEditado)', 'alternarAtivoEntidade(tabela, item.id, !item.ativo)', 'excluirEntidade(tabela, item.id)',
    'entidadeTipo={entidadeTipoVinculo}', 'entidadeId={vinculandoItem.id}', 'entidadeNome={vinculandoItem.nome}'])
})

test('tarefas a-03: tabela com formato, responsável exclusivo e rodapé', () => {
  const src = ler(TAREFAS)
  tem(src, ['placeholder="Nome da nova tarefa"', 'Criar tarefa', '<Th>Tarefa</Th>', '<Th largura={170}>Formato</Th>',
    '<Th largura={300}>Responsável exclusivo</Th>', '<Th largura={120}>', '<Th largura={56}>',
    "return 'Checkbox com opções'", "return 'Opções'", "'Texto e anexo' : 'Data'", '<Badge tom="neu">{rotuloFormato(item)}</Badge>',
    '<option value="">Ninguém (regra normal)</option>', 'title="Responsável exclusivo por esse tipo de tarefa, em todos os clientes"',
    '<Pencil size={15}', '>Editar</Button>', 'rotulo={`Excluir ${item.nome}`}', '<Trash2 size={16}',
    'titulo: `Excluir a tarefa "${item.nome}"?`',
    "descricao: 'Essa ação não pode ser desfeita e remove também os vínculos dela com regimes/grupos/atividades.'",
    'leva a tarefa para Minhas tarefas daquela pessoa em todos os clientes. A troca salva na hora e mostra', 'text-[13px] text-fg-3'])
})

test('tarefas: actions e janelas com os mesmos argumentos', () => {
  const src = ler(TAREFAS)
  tem(src, ['listarTarefaTiposDoSetor(setor)', 'listarUsuariosDoSetor(setor)', 'atualizarResponsavelTarefaTipo(item.id, valor)',
    "const valor = responsavelId === '' ? null : responsavelId", "avisar('Salvo', 'ok')", 'excluirTarefaTipo(item.id)',
    'padrao={true}', 'nome={novoNome}', 'id={editando.id}', 'tipoResposta={editando.tipoResposta}', 'etapas={editando.etapas}',
    'mesesVisiveis={editando.mesesVisiveis}'])
})

test('vincular m-18: janela, busca e a lógica de hoje (atividade escolhe o regime)', () => {
  const src = ler(VINCULAR)
  tem(src, ['<Modal', 'largura="p"', 'titulo={`Tarefas de "${entidadeNome}"`}', 'Marque as tarefas que todo cliente desta atividade recebe',
    'placeholder="Buscar tarefa"', '<Search size={16} />', 'rounded-[10px] border border-line-soft', "'border-t border-line-soft'",
    '{vinculada && (', 'w-[200px]', 'className="h-8"', '<option value="">Todos os regimes</option>',
    'Cada marcação salva na hora. Vincular não cria pendências de meses passados.',
    '<Button variante="fantasma" onClick={onClose} className="ml-auto">Fechar</Button>',
    '<Aviso tom="info">', 'Vínculo direto por regime foi descontinuado', 'Nenhum vínculo antigo restante', '>Remover</Button>'])
  assert.ok(!src.includes('Todas as atividades'))
  assert.ok(!src.includes('variante="primario"'))
})

test('vincular: actions com os mesmos argumentos', () => {
  const src = ler(VINCULAR)
  tem(src, ['listarTarefaTiposDoSetor(setor)', 'listarVinculosAtividadeComRegime(entidadeId)', "listarEntidades('regimes', setor)",
    'listarTarefaTipoIdsVinculados(entidadeTipo, entidadeId)', 'alternarVinculo(tarefaTipoId, entidadeTipo, entidadeId, !jaVinculada)',
    "alternarVinculo(tarefaTipoId, 'regime', entidadeId, false)", 'definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, null, !jaVinculada)',
    'definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, valor, true)', 'async function toggleGrupo('])
})

test('janelas de tipo de tarefa: mesmos textos do formato nas duas', () => {
  for (const arq of [NOVO, EDITAR]) {
    const src = ler(arq)
    tem(src, ['Formato da resposta', "label: 'Data', desc: 'Marca como feita com a data de conclusão'",
      "label: 'Texto e anexo', desc: 'Campo de texto livre e envio de arquivos'",
      "label: 'Opções', desc: 'Lista de etapas com nome, cada uma com sua data'",
      "label: 'Checkbox com opções', desc: 'Marcando todas as opções, a tarefa é concluída sozinha (só no Contábil)'",
      'placeholder="Nome da opção (Enter para adicionar)"', "setor === 'contabil' ? [...FORMATOS_BASE, FORMATO_CHECKLIST] : FORMATOS_BASE",
      '<Modal', 'largura="p"', '<fieldset', 'type="radio"', 'rounded-full'])
    for (const velho of ['Texto + anexo', 'Checkbox com Opções', 'Formato de resposta', "label: 'Etapas'"]) assert.ok(!src.includes(velho), `${arq}: ${velho}`)
  }
  assert.ok(ler(NOVO).includes('Adicione pelo menos uma opção para criar.'))
})

test('novo tipo: props e action iguais', () => {
  const src = ler(NOVO)
  tem(src, ['{ nome, setor, padrao = false, onCancel, onCriado }', 'criarTipoTarefa(setor, nome, tipoResposta, etapasFinal, padrao, mesesVisiveis)',
    "(setor === 'societario' || setor === 'financeiro') ? mesesVisiveisDaPeriodicidade(periodicidade) : null", 'onCriado(nome)'])
})

test('editar tipo: desenho novo, props, action e regra de mesesVisiveis iguais', () => {
  const src = ler(EDITAR)
  tem(src, ['titulo="Editar tipo de tarefa"', 'subtitulo={nome}',
    'ajuda="O nome não pode ser alterado — ele é usado como referência em tarefas já lançadas."', 'value={nome} disabled',
    '<Field rotulo="Periodicidade">', '<Button variante="fantasma" onClick={onCancel}', "'Salvar alterações'", 'variante="primario" onClick={handleSalvar}',
    '{ id, nome, setor, tipoResposta, etapas, mesesVisiveis, onCancel, onSalvo }',
    'atualizarFormatoTarefaTipo(id, tipoRespostaFinal, etapasFinal, mesesVisiveisFinal)',
    "const mesesVisiveisFinal = (setor === 'societario' || setor === 'financeiro') ? mesesVisiveisDaPeriodicidade(periodicidade) : mesesVisiveis",
    'periodicidadeDosMesesVisiveis(mesesVisiveis)', "if (tipoResposta === 'checklist') return 'checklist'",
    "if (etapas && etapas.length > 0) return 'opcoes'", 'onSalvo()'])
  assert.match(src, /interface Props \{\n  id: string\n  nome: string\n  setor: UserSetor\n  tipoResposta: TipoResposta\n  etapas: string\[\] \| null\n  mesesVisiveis: number\[\] \| null\n  onCancel: \(\) => void\n  onSalvo: \(\) => void\n\}/)
  // Periodicidade só aparece para Societário e Financeiro.
  assert.ok(src.includes("{(setor === 'societario' || setor === 'financeiro') && ("))
})

test('lixeira a-10 / mob-14: desenho, filtros e textos', () => {
  const src = ler(LIXEIRA)
  tem(src, ['titulo="Lixeira"', 'subtitulo="Tudo o que é apagado fica aqui por 60 dias"', '<Aviso tom="info">',
    'Restaurar devolve a exclusão inteira, com as tarefas e anexos que foram junto. Remover um cliente de um setor gera duas entradas: <b>restaure as tarefas antes da ficha.</b>',
    'Restaure as tarefas antes da ficha do setor.', '<Field rotulo="Buscar" className="w-full sm:w-[300px]">', 'placeholder="O que foi apagado"',
    '<Field rotulo="Apagado por" className="w-full sm:w-[190px]">', '<option value="">Todos</option>',
    'e.titulo.toLowerCase().includes(termo) || e.resumo.toLowerCase().includes(termo)', 'e.excluidoPorNome === autor',
    '<Card semPadding className="hidden overflow-hidden sm:block">', "'flex items-center gap-4 px-5 py-3.5'", "'border-t border-line-soft'",
    'h-[38px] w-[38px]', 'rounded-[10px] bg-raised text-fg-2', 'clientes: User', 'tarefas: ListChecks', 'clientes_fiscal: FileText',
    'parcelamentos: CreditCard', '?? Trash2', "tom={e.diasRestantes <= 7 ? 'warn' : 'neu'}", 'Expira em {e.diasRestantes} dia',
    '<RotateCcw size={15}', 'Restaurar?', "'Confirmar'", 'variante="primario"', 'variante="fantasma"', 'Já restaurado', '<Check size={13}',
    'sm:hidden', 'px-4 py-3.5', "'h-11 px-3.5 text-sm'", 'Nenhuma exclusão guardada.', '<EmptyState'])
})

test('lixeira: mesma action, mesmas mensagens, fuso fixo', () => {
  const src = ler(LIXEIRA)
  tem(src, ['restaurarExclusao(grupo)', "setErro('Não foi possível restaurar. Tente novamente.')", 'if (r.error) { setErro(r.error); return }',
    "avisar('Exclusão restaurada.', 'ok')", 'router.refresh()', 'useState<string | null>(erroInicial)',
    "sessao: 'pela sessão do usuário'", "servico: 'pelo sistema'", "desconhecido: 'autor desconhecido'",
    'suppressHydrationWarning', "timeZone: 'America/Sao_Paulo'"])
  const pagina = ler(LIXEIRA_PAGINA)
  tem(pagina, ['<Pagina>', '<LixeiraClient exclusoesIniciais={data} erroInicial={error} />', "if (profile?.role !== 'admin') redirect('/intranet')",
    'listarExclusoes()'])
  assert.ok(!pagina.includes('max-w-4xl'))
  assert.ok(!pagina.includes('p-8'))
})
