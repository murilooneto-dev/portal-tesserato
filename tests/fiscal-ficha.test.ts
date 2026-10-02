// tests/fiscal-ficha.test.ts — ficha do cliente (cabeçalho e tarefas) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ARQUIVOS = ['app/fiscal/clientes/[id]/page.tsx', 'components/fiscal/TarefaChecklist.tsx']
const ler = (arq: string) => readFileSync(join(ROOT, arq), 'utf8')

for (const arq of ARQUIVOS) {
  test(`sem visual antigo: ${arq}`, () => {
    const fonte = ler(arq)
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, 'texto abaixo de 12 px')
    assert.doesNotMatch(fonte, /\[var\(--(fg|accent|accent-hover|bg-surface|bg-page)\)\]/, 'cor antiga por var()')
    assert.doesNotMatch(fonte, /\b(amber|red|green|emerald|indigo|orange|blue)-\d{3}\b/, 'cor fixa do Tailwind')
    assert.doesNotMatch(fonte, /(^|[^.\w])(confirm|alert)\(/m, 'confirm()/alert() do navegador')
    assert.doesNotMatch(fonte, /fixed inset-0/, 'janela montada à mão')
    assert.doesNotMatch(fonte, /[⚠⏱📎▶]/u, 'emoji/símbolo no lugar de ícone')
  })
}

test('TarefaChecklist usa o Modal no desbloqueio e mantém as chamadas de dados', () => {
  const fonte = ler('components/fiscal/TarefaChecklist.tsx')
  assert.match(fonte, /components\/ui\/Modal/)
  assert.match(fonte, /desbloquearTarefa\(tarefa\.id, motivo, tipo, competencia\)/)
  for (const chamada of ['onToggle(tipo, true, iso)', 'onAtualizarEtapa?.(tipo, etapaNome, true, iso)', 'onSalvarTexto?.(tipo, valor)', 'onUploadArquivo(tipo, formData)', 'onExcluirArquivo?.(arquivoId)', 'marcarSemMovimento(clienteId, tipo, mes, ano, novo)']) {
    assert.ok(fonte.includes(chamada), chamada)
  }
})

test('página da ficha usa Pagina, Aviso do parcelamento e ClienteAcoes', () => {
  const fonte = ler('app/fiscal/clientes/[id]/page.tsx')
  assert.match(fonte, /<Pagina>/)
  assert.match(fonte, /<Aviso tom="warn">/)
  assert.match(fonte, /<ClienteAcoes /)
})
