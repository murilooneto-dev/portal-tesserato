// tests/fase4b-minhas-tarefas.test.ts — Minhas tarefas (Fase 4b): desenho novo, regras e gravações intactas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import MinhasTarefasTabs from '../components/fiscal/MinhasTarefasTabs'
import DossieSecao from '../components/fiscal/DossieSecao'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = [
  'app/fiscal/minhas-tarefas/page.tsx',
  'components/fiscal/MinhasTarefasTabs.tsx',
  'components/fiscal/MinhasTarefasSecao.tsx',
  'components/fiscal/MinhasTarefasFiltro.tsx',
  'components/fiscal/MinhasTarefasSeletorUsuario.tsx',
  'components/fiscal/DossieSecao.tsx',
  'components/fiscal/EventosConsolidados.tsx',
]

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fontes pequenas, [var(--fg)], cores fixas nem alert/confirm`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /(red|amber|green|yellow)-\d00/)
    assert.doesNotMatch(src, /\b(alert|confirm)\(/)
  })
}

test('as tabelas rolam dentro de "relative overflow-x-auto"', () => {
  for (const arq of ['components/fiscal/MinhasTarefasSecao.tsx', 'components/fiscal/DossieSecao.tsx']) {
    assert.ok(ler(arq).includes('relative overflow-x-auto'), arq)
  }
})

test('abas Tarefas, Eventos e Dossiê com papel de tab e painel', () => {
  const html = renderToStaticMarkup(h(MinhasTarefasTabs, {
    tarefasContent: h('p', null, 'T'),
    eventosContent: h('p', null, 'E'),
    dossieContent: h('p', null, 'D'),
    contagens: { eventos: 3, dossie: 7 },
  }))
  assert.match(html, /role="tablist"/)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3)
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3)
  for (const r of ['Tarefas', 'Eventos', 'Dossiê']) assert.ok(html.includes(r), r)
  assert.match(html, /aria-selected="true"/)
  assert.ok(html.includes('>3<') && html.includes('>7<'))
  // as abas continuam montadas (só escondidas)
  assert.ok(html.includes('>T<') && html.includes('>E<') && html.includes('>D<'))
})

test('dossiê: situação travada e selo quando Finalizado', () => {
  const clientes = [
    { id: 'a', nome: 'Aberta Ltda', cnpj: '11.111.111/0001-11', dossieStatus: 'NAO_INICIADO', dossieFinalizado: false },
    { id: 'b', nome: 'Fechada Ltda', cnpj: null, dossieStatus: 'NAO_INICIADO', dossieFinalizado: true },
  ] as unknown as Parameters<typeof DossieSecao>[0]['clientes']
  const ok = async () => ({ error: null })
  const html = renderToStaticMarkup(h(DossieSecao, { clientes, onAtualizarStatus: ok, onAtualizarFinalizado: ok }))
  assert.ok(html.includes('Aberta Ltda') && html.includes('Fechada Ltda'))
  assert.ok(html.includes('Situação do dossiê de Fechada Ltda'))
  // só o select da linha finalizada fica desabilitado (a linha aparece em tabela e em cartão)
  const selects = html.match(/<select[^>]*aria-label="Situação do dossiê de [^"]*"[^>]*>/g) ?? []
  assert.equal(selects.length, 4)
  assert.equal(selects.filter(s => / disabled=""/.test(s)).length, 2)
  assert.ok(html.includes('Finalizado'))
  assert.ok(html.includes('relative overflow-x-auto'))
})

test('página: somente leitura do admin e gravações iguais', () => {
  const src = ler('app/fiscal/minhas-tarefas/page.tsx')
  assert.ok(src.includes('somenteLeitura = targetUserId !== user.id'))
  assert.ok(src.includes('podeEditar={!somenteLeitura}'))
  assert.ok(src.includes('somenteLeitura={somenteLeitura}'))
  assert.ok(src.includes('<Pagina>') && src.includes('CabecalhoPagina') && src.includes('<Aviso tom="info">'))
  for (const t of [
    'toggleTarefaFiscal(clienteId, tipo, mes, ano, concluida, data)',
    'atualizarEtapa(clienteId, mes, ano, tipo, etapaNome, concluida, data)',
    'atualizarStatusDossie(clienteId, status)',
    'atualizarFinalizadoDossie(clienteId, finalizado)',
    ".eq('responsavel_id', targetUserId)",
    ".eq('clientes_fiscal.faz_dossie', true)",
    'buscarTarefasAvulsasDoMesParaClientes(',
    'calcularTarefasEsperadas(',
  ]) assert.ok(src.includes(t), t)
})

test('seção de tarefas: gravações, 44 px no celular e "Sem movimento" ao lado do nome', () => {
  const src = ler('components/fiscal/MinhasTarefasSecao.tsx')
  for (const t of [
    'onAtualizarEtapa(clienteId, tipo, etapaNome, true, iso)',
    'onToggle(clienteId, tipo, true, iso)',
    'onToggle(clienteId, tipo, false)',
    'marcarSemMovimento(clienteId, tipo, mes, ano, novo)',
    'desbloquearTarefa(tarefa.id, motivoTrim, tipo, competencia)',
    'disabled={somenteLeitura}',
    'h-11',
    'sm:hidden',
  ]) assert.ok(src.includes(t), t)
})

test('dossiê: situação e finalizado chamam as mesmas actions', () => {
  const src = ler('components/fiscal/DossieSecao.tsx')
  assert.ok(src.includes('onAtualizarStatus(clienteId, status)'))
  assert.ok(src.includes('onAtualizarFinalizado(clienteId, finalizado)'))
  assert.ok(src.includes('disabled={finalizado}'))
})

test('eventos: busca, "Novo evento" só com permissão e janelas no Modal', () => {
  const src = ler('components/fiscal/EventosConsolidados.tsx')
  assert.ok(src.includes('{podeEditar && ('))
  assert.ok(src.includes('Novo evento'))
  assert.ok(src.includes("from '@/components/ui/Modal'"))
  assert.doesNotMatch(src, /fixed inset-0/)
  assert.ok(src.includes('<EventoAvulsoModal'))
  assert.ok(src.includes('podeEditar={podeEditar}'))
})
