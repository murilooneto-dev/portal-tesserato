// tests/fase8-rotas-admin.test.ts — rotas, estados e Administração (Fase 8, Frente A):
// /contabil redireciona, ficha inexistente dentro da casca, sem CarregandoPagina,
// esqueleto e vazios compactos em Configurações, Ferramentas, Vínculos e impressão por tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NaoEncontrada from '../app/not-found'
import FiscalNaoEncontrado from '../app/fiscal/clientes/[id]/not-found'
import ContabilNaoEncontrado from '../app/contabil/clientes/[id]/not-found'
import PessoalNaoEncontrado from '../app/pessoal/clientes/[id]/not-found'
import SocietarioNaoEncontrado from '../app/societario/clientes/[id]/not-found'
import FinanceiroNaoEncontrado from '../app/financeiro/clientes/[id]/not-found'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')

function arquivos(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap(n => {
    const rel = `${dir}/${n}`
    return statSync(join(process.cwd(), rel)).isDirectory() ? arquivos(rel) : rel.endsWith('.tsx') ? [rel] : []
  })
}

// ---------- Rotas ----------

test('/contabil redireciona para o dashboard, como os outros setores', () => {
  const src = ler('app/contabil/page.tsx')
  assert.match(src, /redirect\('\/contabil\/dashboard'\)/)
  assert.ok(!src.includes('Em construção'))
  assert.ok(!src.includes('[var(--fg)]'))
})

test('ficha inexistente: cada setor mostra "Cliente não encontrado" dentro da casca, com volta para a lista', () => {
  const setores = {
    fiscal: FiscalNaoEncontrado, contabil: ContabilNaoEncontrado, pessoal: PessoalNaoEncontrado,
    societario: SocietarioNaoEncontrado, financeiro: FinanceiroNaoEncontrado,
  }
  for (const [setor, Comp] of Object.entries(setores)) {
    const html = renderToStaticMarkup(h(Comp))
    assert.match(html, /Cliente não encontrado/, setor)
    assert.match(html, /O endereço pode ter mudado ou o cliente foi excluído\. Se ele foi excluído há menos de 60 dias, um administrador pode restaurá-lo na Lixeira\./, setor)
    assert.match(html, new RegExp(`<a[^>]*href="/${setor}/clientes"[^>]*>[\\s\\S]*Ir para Clientes</a>`), setor)
    assert.match(html, /bg-acc/, `${setor}: botão primário`)
    // Pagina (moldura da casca), não tela cheia como a 404 da raiz
    assert.match(html, /px-4 py-6 sm:px-8/, setor)
    assert.ok(!html.includes('min-h-dvh'), setor)
    // a página da ficha chama notFound() para cair aqui
    assert.match(ler(`app/${setor}/clientes/[id]/page.tsx`), /notFound\(\)/, setor)
  }
})

test('404 da raiz usa buttonClassName no link', () => {
  assert.match(ler('app/not-found.tsx'), /className=\{buttonClassName\(\{ variante: 'primario' \}\)\}/)
  const html = renderToStaticMarkup(h(NaoEncontrada))
  assert.match(html, /<a class="[^"]*bg-acc[^"]*max-sm:min-h-11[^"]*" href="\/intranet">Ir para o Início<\/a>/)
})

test('CarregandoPagina (código morto) foi apagado e nenhum loading.tsx voltou', () => {
  assert.equal(existsSync(join(process.cwd(), 'components/shell/CarregandoPagina.tsx')), false)
  for (const a of ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro', 'admin', '(comum)']) {
    assert.equal(existsSync(join(process.cwd(), 'app', a, 'loading.tsx')), false, a)
  }
})

test('globals.css sem o remendo text-[var(--fg)]/NN e nenhuma tela usa mais a classe', () => {
  assert.ok(!ler('app/globals.css').includes(String.raw`\[var\(--fg\)\]`))
  for (const dir of ['app', 'components']) {
    for (const arq of arquivos(dir)) assert.ok(!ler(arq).includes('text-[var(--fg)]'), arq)
  }
})

// ---------- Configurações ----------

const CONFIG = arquivos('app/admin/configuracoes')

test('Configurações: nenhum "Carregando…" solto; abas e janelas com esqueleto', () => {
  for (const arq of CONFIG) assert.ok(!ler(arq).includes('Carregando…'), arq)
  for (const arq of [
    'app/admin/configuracoes/financeiro/FinanceiroCatalogoTab.tsx', 'app/admin/configuracoes/financeiro/TarefasFinanceiroTab.tsx',
    'app/admin/configuracoes/financeiro/VincularClientesModal.tsx', 'app/admin/configuracoes/societario/DocumentacoesTab.tsx',
    'app/admin/configuracoes/societario/ProcessosTab.tsx', 'app/admin/configuracoes/societario/TarefasSocietarioTab.tsx',
    'app/admin/configuracoes/societario/VincularClientesModal.tsx', 'app/admin/configuracoes/_tarefas/EntidadeListaTab.tsx',
    'app/admin/configuracoes/_tarefas/TarefasTab.tsx', 'app/admin/configuracoes/_tarefas/VincularTarefasModal.tsx',
  ]) assert.match(ler(arq), /<EsqueletoLinhas linhas=\{\d\}/, arq)
})

test('Configurações: vazios em EmptyState compacto, sem parágrafo "Nenhum…" solto', () => {
  for (const arq of CONFIG) {
    const src = ler(arq)
    assert.doesNotMatch(src, /<p[^>]*>Nenhum/, arq)
    // Dentro das abas e janelas, o vazio é a variante compacta (a página inicial é tela cheia).
    if (!arq.endsWith('/page.tsx')) for (const m of src.matchAll(/<EmptyState\b[^>]*/g)) assert.match(m[0], /compacto/, arq)
  }
})

test('VincularTarefasModal: no celular o regime desce e não espreme o nome', () => {
  const src = ler('app/admin/configuracoes/_tarefas/VincularTarefasModal.tsx')
  assert.match(src, /className="min-w-0 flex-1 max-sm:basis-full"/)
  assert.match(src, /className="w-\[200px\] flex-none max-sm:w-full max-sm:pl-7"/)
})

// ---------- Ferramentas e Vínculos ----------

test('Ferramentas: TessHub com buttonClassName, vazio compacto fora da tabela, senha ISS sem 28px fixo', () => {
  const src = ler('app/(comum)/ferramentas/FerramentasClient.tsx')
  assert.match(src, /href="https:\/\/tesshub\.com\.br\/login"[\s\S]{0,120}className=\{buttonClassName\(\{ variante: 'primario' \}\)\}/)
  assert.ok(!src.includes('inline-flex h-9 items-center gap-2 rounded-lg border border-acc'))
  assert.match(src, /<EmptyState compacto icone=\{<Search size=\{20\} \/>\} titulo="Nenhum cliente encontrado"/)
  assert.ok(!src.includes('colSpan'))
  assert.ok(!src.includes('className="h-7 w-7"'))
})

test('Vínculos: vazios em EmptyState compacto', () => {
  const src = ler('app/(comum)/vinculos/VinculosClient.tsx')
  assert.match(src, /<EmptyState compacto icone=\{<Link2[^>]*\/>\} titulo="Nenhum vínculo cadastrado"/)
  assert.match(src, /<EmptyState compacto icone=\{<ListChecks[^>]*\/>\} titulo="Nenhuma tarefa nesse setor"/)
  assert.doesNotMatch(src, /<p[^>]*>Nenhuma/)
})

// ---------- Impressão por tokens ----------

test('Relatórios do Financeiro e Logs imprimem com tokens (o @media print redefine as cores)', () => {
  for (const arq of ['app/financeiro/relatorios/RelatoriosFinanceiroClient.tsx', 'app/fiscal/parametros/logs/LogsEventosClient.tsx']) {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-black|border-black|emerald-|red-\d/, arq)
    assert.match(src, /hidden print:block/, arq)
  }
  const css = ler('app/globals.css')
  assert.match(css, /@media print \{[\s\S]*--fg: #000000;[\s\S]*--ok: #047857;[\s\S]*--danger: #B91C1C;/)
})

// ---------- Qualidade ----------

test('arquivos da frente: sem fonte abaixo de 12px e sem emoji', () => {
  for (const arq of [
    ...CONFIG, 'app/(comum)/ferramentas/FerramentasClient.tsx', 'app/(comum)/vinculos/VinculosClient.tsx',
    'app/not-found.tsx', 'app/contabil/page.tsx',
    ...['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'].map(s => `app/${s}/clientes/[id]/not-found.tsx`),
  ]) {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(9|10|11)(\.5)?px\]/, arq)
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⏳⚠]/u, arq)
  }
})
