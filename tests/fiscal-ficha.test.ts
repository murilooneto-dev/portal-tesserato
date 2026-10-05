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
  assert.match(fonte, /<Aviso tom="warn"[\s>]/)
  assert.match(fonte, /<ClienteAcoes /)
})

// ---- T5: demais seções da ficha e abas do celular ----
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AbasFichaCelular from '../components/fiscal/AbasFichaCelular'

const SECOES = [
  'components/fiscal/ClienteObs.tsx',
  'components/fiscal/ClienteArquivos.tsx',
  'components/fiscal/ClienteConferencia.tsx',
  'components/fiscal/AbasFichaCelular.tsx',
  'components/geral/EventosAvulsosSecao.tsx',
  'components/geral/EventoAvulsoModal.tsx',
  'components/HistoricoResponsavel.tsx',
]

for (const arq of SECOES) {
  test(`sem visual antigo: ${arq}`, () => {
    const fonte = ler(arq)
    assert.doesNotMatch(fonte, /(^|[^.\w])(confirm|alert)\(/m, 'confirm()/alert() do navegador')
    assert.doesNotMatch(fonte, /fixed inset-0/, 'janela montada à mão')
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, 'texto abaixo de 12 px')
    assert.doesNotMatch(fonte, /\[var\(--(fg|accent|accent-hover|accent-ink|bg-surface|bg-page)\)\]/, 'cor antiga por var()')
    assert.doesNotMatch(fonte, /\b(amber|red|green|emerald|indigo|orange|blue|yellow)-\d{3}\b/, 'cor fixa do Tailwind')
    assert.doesNotMatch(fonte, /[📂🔍⏳⬇📎📊⚠✏✕]/u, 'emoji/símbolo no lugar de ícone')
  })
}

test('EventoAvulsoModal usa o Modal e mantém a janela aberta se um anexo falhar', () => {
  const fonte = ler('components/geral/EventoAvulsoModal.tsx')
  assert.match(fonte, /components\/ui\/Modal/)
  assert.match(fonte, /criarTarefaAvulsa\(\{ clienteId, setor, titulo: titulo\.trim\(\), descricao: descricao\.trim\(\) \|\| null, data \}\)/)
  assert.match(fonte, /uploadArquivoEvento\(eventoId, clienteId, setor, formData\)/)
  assert.match(fonte, /falharam\.length > 0[\s\S]*?return\s+\}\s+onClose\(\)/, 'só fecha quando nenhum anexo falhou')
})

test('ClienteArquivos pede confirmação com useConfirmar e mantém as chamadas', () => {
  const fonte = ler('components/fiscal/ClienteArquivos.tsx')
  assert.match(fonte, /useConfirmar/)
  assert.match(fonte, /uploadArquivo\(clienteId, formData\)/)
  assert.match(fonte, /excluirArquivo\(id\)/)
})

test('ClienteObs mantém a chamada salvarObs', () => {
  assert.match(ler('components/fiscal/ClienteObs.tsx'), /salvarObs\(clienteId, mes, ano, obs\)/)
})

test('abas do celular: papéis ARIA e todos os painéis presentes no HTML', () => {
  const html = renderToStaticMarkup(h(AbasFichaCelular, {
    principal: [
      { chave: 'tarefas', aba: 'tarefas', conteudo: h('p', null, 'PAINEL-TAREFAS') },
      { chave: 'eventos', aba: 'eventos', conteudo: h('p', null, 'PAINEL-EVENTOS') },
      { chave: 'conferencia', aba: 'arquivos', conteudo: h('p', null, 'PAINEL-CONFERENCIA') },
    ],
    lateral: [
      { chave: 'observacao', aba: 'tarefas', conteudo: h('p', null, 'PAINEL-OBS') },
      { chave: 'historico', aba: 'historico', conteudo: h('p', null, 'PAINEL-HISTORICO') },
      { chave: 'arquivos', aba: 'arquivos', conteudo: h('p', null, 'PAINEL-ARQUIVOS') },
    ],
  }))
  assert.equal((html.match(/role="tablist"/g) ?? []).length, 1)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 4)
  for (const rotulo of ['Tarefas', 'Eventos', 'Histórico', 'Arquivos']) assert.ok(html.includes(`>${rotulo}</button>`), rotulo)
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1)
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 6)
  for (const p of ['TAREFAS', 'EVENTOS', 'CONFERENCIA', 'OBS', 'HISTORICO', 'ARQUIVOS']) assert.ok(html.includes(`PAINEL-${p}`), p)
  // no desktop (lg) todos aparecem; abaixo, só o da aba ativa
  assert.equal((html.match(/lg:block/g) ?? []).length, 6)
  assert.match(html, /lg:hidden/)
})

test('aba Histórico sem histórico mostra estado vazio no celular', () => {
  const html = renderToStaticMarkup(h(AbasFichaCelular, {
    principal: [],
    lateral: [{ chave: 'historico', aba: 'historico', conteudo: null }],
  }))
  assert.match(html, /Sem troca de responsável registrada\./)
})
