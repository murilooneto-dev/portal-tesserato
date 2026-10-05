// tests/fase5-final-janelas.test.ts — Janelas Editar empresa do Contábil/Pessoal e ajustes da ficha do Fiscal (Fase 5 final, frente C).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const JANELAS = [
  { arq: 'components/contabil/EmpresaContabilModal.tsx', setor: 'contabil', action: 'salvarClienteContabil(clienteId, clientePayload, contabilPayload)', props: 'EmpresaContabilModal({ clienteId, responsaveis, tarefasPadrao, catalogo, onClose, readOnly = false }: Props)' },
  { arq: 'components/pessoal/EmpresaPessoalModal.tsx', setor: 'pessoal', action: 'salvarClientePessoal(clienteId, clientePayload, pessoalPayload)', props: 'EmpresaPessoalModal({ clienteId, responsaveis, tarefasPadrao, catalogo, onClose, readOnly = false }: Props)' },
]
const FICHA = 'app/fiscal/clientes/[id]/page.tsx'

for (const { arq, setor, action, props } of [...JANELAS, { arq: FICHA, setor: '', action: '', props: '' }]) {
  test(`${arq}: sem fontes pequenas, sem [var(--fg)], sem confirm()/alert(), sem emoji de aviso`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/)
    assert.ok(!src.includes('⚠'))
  })
  if (!setor) continue

  test(`${arq}: usa o Modal comum (sem overlay próprio) e os campos do kit`, () => {
    const src = ler(arq)
    assert.ok(!src.includes('fixed inset-0'))
    assert.match(src, /<Modal\s/)
    for (const imp of ["from '@/components/ui/Modal'", "from '@/components/ui/Field'", "from '@/components/ui/Input'", "from '@/components/ui/Button'"]) {
      assert.ok(src.includes(imp), imp)
    }
    for (const s of ['titulo="Identificação"', 'titulo="Enquadramento"', 'titulo="Tarefas do cliente"']) assert.ok(src.includes(s), s)
    assert.ok(src.includes('Cancelar') && src.includes('Salvar empresa'))
  })

  test(`${arq}: props e chamada da action iguais`, () => {
    const src = ler(arq)
    assert.ok(src.includes(props))
    assert.ok(src.includes(`const { error } = await ${action}`))
    assert.ok(src.includes('router.refresh()'))
  })

  test(`${arq}: tarefas nos 3 blocos de hoje e confirmação via useConfirmar`, () => {
    const src = ler(arq)
    assert.ok(src.includes('Tarefas ({form.tarefas_personalizadas.length})'))
    assert.ok(src.includes('Agrupar tarefas'))
    assert.ok(src.includes('<GruposTarefasModal'))
    assert.ok(src.includes(`setor="${setor}"`))
    assert.ok(src.includes('<TarefasAutomaticasCampo'))
    assert.ok(src.includes("onChangeExcluidas={v => set('tarefas_excluidas', v)}"))
    assert.ok(src.includes('useConfirmar()'))
    assert.ok(src.includes('apaga o histórico dessa tarefa nele'))
    assert.ok(src.includes(`.eq('setor', '${setor}')`))
  })
}

test('ficha do Fiscal: trilha Clientes › nome, Ver parcelamentos, avatar e sem mês solto nas ações', () => {
  const src = ler(FICHA)
  assert.ok(src.includes('aria-label="Caminho"'))
  assert.ok(src.includes('href="/fiscal/clientes"'))
  assert.ok(!src.includes('ArrowLeft'))
  assert.ok(src.includes('href="/fiscal/parcelamentos"') && src.includes('Ver parcelamentos'))
  assert.ok(src.includes('cliente.responsavel.charAt(0).toUpperCase()'))
  assert.ok(!src.includes('MESES_ABREV'))
})

test('ficha do Fiscal: actions do servidor com os mesmos argumentos', () => {
  const src = ler(FICHA)
  for (const s of [
    'toggleTarefaFiscal(id, tipo, mes, ano, concluida, data)',
    'atualizarEtapa(id, mes, ano, tipo, etapaNome, concluida, data)',
    'salvarRespostaTexto(id, tipo, mes, ano, texto)',
    'uploadArquivoTarefa(id, tipo, mes, ano, formData)',
    'excluirArquivoTarefa(arquivoId)',
    '<ClienteAcoes cliente={cliente} responsaveis={responsaveis} catalogo={catalogo} />',
  ]) assert.ok(src.includes(s), s)
})
