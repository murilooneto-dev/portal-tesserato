// tests/fase6-procedimentos.test.ts — Procedimentos do Societário (Fase 6, Frente A).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const PAGINA = 'app/societario/procedimentos/page.tsx'
const MODAL = 'components/societario/ProcedimentoModal.tsx'

const tem = (src: string, trechos: string[]) => { for (const t of trechos) assert.ok(src.includes(t), t) }

for (const arq of [PAGINA, MODAL]) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}✀-➿]/u)
    assert.doesNotMatch(src, /[✓✗✏×⚠]/)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('statusProcedimentoBadge'))
  })
}

test('página: cabeçalho, filtros persistentes e tabela do s-01', () => {
  const src = ler(PAGINA)
  tem(src, [
    '<Pagina', 'titulo="Procedimentos"', 'clique na linha para ver as etapas', 'Novo procedimento',
    "useFiltroPersistente('procedimentos:busca', '')",
    "useFiltroPersistente<'TODOS' | StatusProcedimento>('procedimentos:status', 'TODOS')",
    'rotulo="Buscar" className="w-[300px]"', 'placeholder="Nome da empresa"',
    'rotulo="Situação" className="w-[200px]"', '<option value="TODOS">Todas</option>',
    '<Card semPadding className="hidden overflow-hidden lg:block">', 'relative overflow-x-auto xl:overflow-visible',
    'min-[1400px]:w-[340px]', 'min-[1400px]:w-[280px]', 'min-[1400px]:w-[220px]', 'largura={56}',
    'Tipo de processo', 'Responsável', 'ChevronDown', 'ChevronUp', 'colSpan={5}', 'px-[22px] py-[18px]',
    'tomStatusProcedimento(status)', 'rotuloStatusProcedimento(status)', "|| 'var(--acc)'", 'h-6 w-6',
    '<EmptyState',
  ])
})

test('página: consultas iguais às de antes, mais a leitura de perfis', () => {
  const src = ler(PAGINA)
  tem(src, [
    ".from('procedimentos_societario')",
    ".select('*, processo_tipos(nome), documentacao_modelos(nome), procedimento_arquivos(id, name, size)')",
    ".order('created_at', { ascending: false })",
    "sb.from('processo_tipos').select('id, nome, etapas').order('nome')",
    "sb.from('documentacao_modelos').select('id, nome').order('nome')",
    "sb.from('clientes').select('id, nome').order('nome')",
    "sb.from('processo_subetapas').select('id, processo_tipo_id, etapa_nome, nome, tipo_resposta, ordem')",
    "sb.from('profiles').select('nome, cor').order('nome')",
    'montarProcessoTipos(catalogos.tipos, catalogos.subetapas)',
  ])
  // Só leitura de perfis: nenhuma escrita além de excluir o procedimento.
  assert.equal((src.match(/\.(insert|update|upsert)\(/g) ?? []).length, 0)
  assert.equal((src.match(/\.delete\(\)/g) ?? []).length, 1)
})

test('página: detalhe da linha (ações, documento, anexos, etapas e subetapas)', () => {
  const src = ler(PAGINA)
  tem(src, [
    '<Pencil', '>Editar</Button>', 'variante="perigo"', '<Trash2', '>Excluir</Button>',
    'Documento vinculado:', 'href={`/api/arquivos/procedimento/${arq.id}`}', 'formatBytes(arq.size)', '<Paperclip',
    'sm:grid-cols-2 lg:grid-cols-3', 'text-xs font-semibold uppercase', "'Sem resposta'",
    'border-l-2 border-line', '<Badge tom="ok"', '>Sim</Badge>', '<Badge tom="dng"', '>Não</Badge>',
    'formatarDdMm(', 'item.subetapas?.[sub.id]',
  ])
})

test('página: excluir pede confirmação e mostra o erro', () => {
  const src = ler(PAGINA)
  tem(src, [
    'useConfirmar()', 'perigo: true',
    "const { error } = await sb.from('procedimentos_societario').delete().eq('id', id)",
    "toast(`Não foi possível excluir o procedimento: ${error.message}`, 'dng')",
  ])
})

test('página: celular do mob-12', () => {
  const src = ler(PAGINA)
  tem(src, [
    'className="h-11"', 'h-11 w-11', 'aria-label="Filtros"', "<Chip ativo={statusFiltro === 'TODOS'}",
    'STATUS_OPCOES.map(s => (', 'lg:hidden',
    'fixed bottom-[84px] right-4', 'h-[52px] rounded-[26px]', 'shadow-lg lg:hidden', 'hidden lg:inline-flex',
  ])
})

test('janela: desenho do m-15', () => {
  const src = ler(MODAL)
  tem(src, [
    "titulo={editItem ? 'Editar procedimento' : 'Novo procedimento'}", 'subtitulo="Societário"', 'largura="g"', 'bloqueado={saving}',
    'rotulo="Tipo de processo"', 'obrigatorio',
    'Nenhum tipo de processo cadastrado — cadastre em Configurações → Societário.',
    'rotulo="Responsável"', '(atual)', 'rotulo="Cliente cadastrado"', '<Switch',
    '{editItem && (', 'rotulo="Status"',
    'Campos do processo', 'bg-page px-4 py-3.5', 'placeholder="Resposta da etapa"', 'border-l-2 border-line',
    'className="w-[170px]"', 'type="date"',
    'Preencher documento?', 'rotulo="Modelo"', '<FileText', "'Gerar PDF'",
    'disabled={!form.preencherDocumento || !form.documentacao_modelo_id}',
    'Escolher arquivos', 'accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"', 'multiple',
    'variante="fantasma"', '>Cancelar</Button>', "'Salvar procedimento'",
    '<Aviso tom="dng">{erro}</Aviso>',
  ])
})

test('janela: gravação, anexos e PDF com os mesmos argumentos de antes', () => {
  const src = ler(MODAL)
  tem(src, [
    "import { uploadArquivoProcedimento, excluirArquivoProcedimento } from '@/lib/procedimento-arquivos-actions'",
    'if (!form.processo_tipo_id || !form.empresa.trim()) return',
    'processo_tipo_id: form.processo_tipo_id,',
    'cliente_id: form.clienteCadastrado ? (form.cliente_id || null) : null,',
    'empresa: form.empresa.trim(),',
    'responsavel: form.responsavel.trim() || null,',
    'status: form.status,',
    'campos: form.campos,',
    'subetapas: form.subetapasValores,',
    'documentacao_modelo_id: form.preencherDocumento ? (form.documentacao_modelo_id || null) : null,',
    'updated_at: new Date().toISOString(),',
    "sb.from('procedimentos_societario').update(payload).eq('id', editItem.id).select('id').single()",
    "sb.from('procedimentos_societario').insert(payload).select('id').single()",
    "formData.append('arquivo', arquivo)",
    'await uploadArquivoProcedimento(salvo.id, formData)',
    'await excluirArquivoProcedimento(arquivoId)',
    "fetch('/api/societario/gerar-documento', {",
    "method: 'POST'",
    "modeloNome: modelo?.nome ?? 'Documento',",
    "processoNome: tipo?.nome ?? '',",
    'campos: Object.entries(form.campos).map(([etapa, valor]) => ({ etapa, valor })),',
    "a.download = `${modelo?.nome ?? 'documento'}-${form.empresa}.pdf`",
  ])
})

test('janela: nenhuma função sumiu (subetapas, marcar = hoje, trocar tipo, cliente)', () => {
  const src = ler(MODAL)
  tem(src, [
    // checklist aceita vazio: clicar na opção ativa limpa.
    "setSubetapaValor(sub.id, v === atual ? null : v === 'sim')",
    // data: caixa que marca com a data de hoje.
    'e.target.checked ? new Date().toISOString().slice(0, 10) : null',
    "sub.tipoResposta === 'texto'", 'setSubetapaValor(sub.id, e.target.value)',
    // trocar o tipo preserva as respostas já digitadas.
    "campos[etapa] = form.campos[etapa] ?? ''",
    'form.subetapasValores[sub.id] ?? defaultValorSubetapa(sub.tipoResposta)',
    'editItem.subetapas?.[sub.id] ?? defaultValorSubetapa(sub.tipoResposta)',
    "clienteCadastrado: cadastrado, cliente_id: '', empresa: ''",
    "cliente_id: clienteId, empresa: cliente?.nome ?? ''",
    "preencherDocumento: false, documentacao_modelo_id: ''",
    'handleRemoverArquivoNovo(idx)', 'handleExcluirArquivoExistente(arq.id)',
    'href={`/api/arquivos/procedimento/${arq.id}`}',
  ])
})
