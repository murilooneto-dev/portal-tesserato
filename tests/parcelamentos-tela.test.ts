// tests/parcelamentos-tela.test.ts — Parcelamentos (Fase 4c, T1): regras puras, desenho novo e relatório.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TODOS, agruparPorSecao, filtrarParcelamentos, parcelasEmitidas, reguaDeMeses, secoesParaMostrar,
  statusVisual, subtituloContagem, textoEmitidas, type Parcelamento,
} from '../lib/parcelamentos-tela'
import { montarRelatorioHtml } from '../lib/parcelamentos-relatorio'
import ParcelamentoDetalhe from '../components/fiscal/parcelamentos/ParcelamentoDetalhe'
import ParcelamentosLista from '../components/fiscal/parcelamentos/ParcelamentosLista'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

function parc(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'a', secao: 'PGFN - ECAC', empresa: 'Empresa Com Um Nome Muito Mas Muito Longo Mesmo LTDA', empresa_avulsa: false,
    cnpj: '00.000.000/0001-91', regime: 'Simples Nacional', responsavel: 'Maria', local_tipo: 'ECAC', status: 'EM ANDAMENTO',
    setores: ['fiscal'], tarefa: null, senhas: 'segredo123',
    jan: '02/01', fev: null, mar: '  ', abr: null, mai: null, jun: null, jul: null, ago: null, set: '10/09', out: null, nov: null, dez: null,
    ...over,
  }
}

const SECOES = [{ id: '1', nome: 'PGFN - ECAC' }, { id: '2', nome: 'DETRAN - CE' }, { id: '3', nome: 'VAZIA' }]

test('filtrarParcelamentos: busca em empresa, CNPJ e responsável; seção e responsável exatos', () => {
  const itens = [parc(), parc({ id: 'b', empresa: 'Outra', cnpj: '11.111.111/0001-11', responsavel: 'João', secao: 'DETRAN - CE' })]
  const base = { busca: '', secao: TODOS, responsavel: TODOS }
  assert.equal(filtrarParcelamentos(itens, base).length, 2)
  assert.deepEqual(filtrarParcelamentos(itens, { ...base, busca: 'outra' }).map(p => p.id), ['b'])
  assert.deepEqual(filtrarParcelamentos(itens, { ...base, busca: '11.111' }).map(p => p.id), ['b'])
  assert.deepEqual(filtrarParcelamentos(itens, { ...base, busca: 'joão' }).map(p => p.id), ['b'])
  assert.deepEqual(filtrarParcelamentos(itens, { ...base, secao: 'PGFN - ECAC' }).map(p => p.id), ['a'])
  assert.deepEqual(filtrarParcelamentos(itens, { ...base, responsavel: 'João' }).map(p => p.id), ['b'])
})

test('agruparPorSecao: segue a ordem das seções, omite vazias e seção desconhecida', () => {
  const itens = [parc({ id: 'b', secao: 'DETRAN - CE' }), parc({ id: 'a' }), parc({ id: 'c', secao: 'NAO EXISTE' })]
  const grupos = agruparPorSecao(itens, secoesParaMostrar(SECOES, TODOS))
  assert.deepEqual(grupos.map(g => g.secao), ['PGFN - ECAC', 'DETRAN - CE'])
  assert.deepEqual(secoesParaMostrar(SECOES, 'DETRAN - CE'), ['DETRAN - CE'])
})

test('régua dos meses: conta emitidas ignorando vazio/espaços e marca o mês atual', () => {
  const p = parc()
  assert.equal(parcelasEmitidas(p), 2)
  assert.equal(textoEmitidas(p), '2 de 12 emitidas')
  const r = reguaDeMeses(p, 9)
  assert.equal(r.length, 12)
  assert.equal(r[0].emitida, true)
  assert.equal(r[2].emitida, false)
  assert.equal(r[8].atual, true)
  assert.equal(r.filter(m => m.atual).length, 1)
  assert.equal(reguaDeMeses(p, null).some(m => m.atual), false)
})

test('statusVisual e subtituloContagem', () => {
  assert.equal(statusVisual('LIQUIDADO').tom, 'ok')
  assert.equal(statusVisual('CANCELADO').tom, 'dng')
  assert.equal(statusVisual('EM ANDAMENTO').rotulo, 'Em andamento')
  assert.equal(subtituloContagem(1, 1), '1 parcelamento em 1 seção')
  assert.equal(subtituloContagem(3, 2), '3 parcelamentos em 2 seções')
})

test('detalhe: senhas ocultas por padrão, botão Mostrar e as 12 parcelas', () => {
  const html = renderToStaticMarkup(h(ParcelamentoDetalhe, { item: parc(), mesAtual: 9, onEditar: () => {}, onExcluir: () => {} }))
  assert.ok(!html.includes('segredo123'))
  assert.ok(html.includes('Mostrar'))
  assert.ok(html.includes('Empresa Com Um Nome Muito Mas Muito Longo Mesmo LTDA'))
  assert.equal((html.match(/<li /g) ?? []).length, 12)
  assert.ok(html.includes('02/01') && html.includes('10/09'))
  assert.ok(html.includes('Setembro · atual'))
  assert.ok(!html.includes('Voltar à lista'))
})

test('detalhe no celular tem voltar; sem senha não mostra o botão', () => {
  const html = renderToStaticMarkup(h(ParcelamentoDetalhe, { item: parc({ senhas: null }), mesAtual: null, onEditar: () => {}, onExcluir: () => {}, onVoltar: () => {} }))
  assert.ok(html.includes('Voltar à lista'))
  assert.ok(!html.includes('Mostrar'))
})

test('lista: nome e CNPJ inteiros (sem truncate), seção com contagem e item atual marcado', () => {
  const html = renderToStaticMarkup(h(ParcelamentosLista, {
    grupos: [{ secao: 'PGFN - ECAC', itens: [parc(), parc({ id: 'b', cnpj: null })] }], selecionadoId: 'a', mesAtual: 9, onSelecionar: () => {},
  }))
  assert.ok(html.includes('Empresa Com Um Nome Muito Mas Muito Longo Mesmo LTDA'))
  assert.ok(html.includes('CNPJ não informado'))
  assert.ok(html.includes('· 2'))
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /\btruncate\b/)
})

test('relatório: mesmo conteúdo, com escape de HTML nos dados', () => {
  const html = montarRelatorioHtml({
    filtered: [parc({ empresa: '<script>x</script>' })], secoes: SECOES, secaoFiltro: TODOS, respFiltro: TODOS, search: '"a"', ano: 2026, agora: 'HOJE',
  })
  assert.ok(!html.includes('<script>x</script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('Relatório de Parcelamentos — 2026'))
  assert.ok(html.includes('Busca: "&quot;a&quot;"'))
  assert.ok(html.includes('1 parcelamento<'))
  assert.ok(html.includes('<th class="month">JAN</th>'))
})

const NOVOS = [
  'components/fiscal/parcelamentos/ParcelamentosCabecalho.tsx',
  'components/fiscal/parcelamentos/ParcelamentosLista.tsx',
  'components/fiscal/parcelamentos/ParcelamentoDetalhe.tsx',
  'components/fiscal/parcelamentos/ParcelamentosConteudo.tsx',
]
for (const arq of NOVOS) {
  test(`${arq}: sem confirm/alert, overlay fixo, fontes pequenas, [var(--fg)] nem cores fixas`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /\b(alert|confirm)\(/)
    assert.doesNotMatch(src, /fixed inset-0/)
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /(red|amber|green|yellow|blue)-\d00/)
  })
}

test('page: exclusão usa useConfirmar (perigo) e não há confirm()', () => {
  const src = ler('app/fiscal/parcelamentos/page.tsx')
  assert.doesNotMatch(src, /\b(alert|confirm)\(/)
  assert.ok(src.includes('useConfirmar'))
  assert.match(src, /perigo: true/)
  assert.ok(ler('components/fiscal/parcelamentos/ParcelamentoModal.tsx').includes('montarUpdateParcelamento(formFinal, formFinal.empresa_avulsa)'))
})

test('relatório usa escapeHtml', () => {
  assert.ok(ler('lib/parcelamentos-relatorio.ts').includes("from './escape-html'"))
})
