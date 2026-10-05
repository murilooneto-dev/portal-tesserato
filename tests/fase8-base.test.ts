// tests/fase8-base.test.ts — peças compartilhadas da Fase 8 (passo 0): janelas no
// celular, alvos de 44px, aviso, vazio compacto, esqueleto, casca e globals.css.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Modal, Drawer } from '../components/ui/Modal'
import { Button, IconButton } from '../components/ui/Button'
import { Input, Select, Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { EsqueletoLinhas, EsqueletoCartao } from '../components/ui/Esqueleto'
import { POSICAO_TOAST } from '../components/ui/Toast'
import { CabecalhoPagina } from '../components/ui/Pagina'
import { TituloCascaProvider, repeteTituloDaCasca } from '../components/ui/TituloCasca'
import * as ui from '../components/ui'
import { BarraTopo } from '../components/shell/BarraTopo'
import { BarraInferior } from '../components/shell/BarraInferior'
import { GavetaMenu } from '../components/shell/GavetaMenu'
import { TrilhoIcones } from '../components/shell/TrilhoIcones'
import { montarMenu, atalhosCelular, tituloDaPagina, voltarDaFicha, rotuloCurto, type PerfilMenu } from '../lib/navegacao'
import { formatarBadgeVinculo } from '../lib/vinculos'
import type { Profile } from '../lib/types'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')
const nada = () => {}
const admin: PerfilMenu = { role: 'admin', setores: ['fiscal'], paginas_acesso: [] }
const perfil = (setores: Profile['setores'], role: Profile['role'] = 'operador'): Profile =>
  ({ id: 'u1', nome: 'Admin Dev', role, setores, cor: '#6366f1', created_at: '2026-01-01', paginas_acesso: [] }) as Profile

// ---------- 1. Janelas ----------

test('janela no celular abre de baixo, com alça, até 90dvh e fechar de 44px; desktop igual', () => {
  const html = renderToStaticMarkup(h(Modal, { aberto: true, onFechar: nada, titulo: 'Novo recebimento', rodape: h('button', null, 'Salvar') }, 'x'))
  assert.match(html, /items-end/)
  assert.match(html, /sm:items-start/)
  assert.match(html, /sm:p-10/)
  assert.match(html, /max-h-\[90dvh\]/)
  assert.match(html, /rounded-t-\[18px\]/)
  assert.match(html, /sm:rounded-\[14px\]/)
  assert.match(html, /h-1 w-9[^"]*sm:hidden/)
  assert.match(html, /overflow-y-auto/)
  const fechar = html.match(/<button[^>]*aria-label="Fechar \(Esc\)"[^>]*>/)?.[0] ?? ''
  assert.match(fechar, /max-sm:h-11/)
  assert.match(fechar, /max-sm:w-11/)
  // rodapé: botões na largura toda e 48px no celular
  assert.match(html, /max-sm:\[&amp;_button\]:min-h-12|max-sm:\[&_button\]:min-h-12/)
  assert.match(html, /max-sm:\[&amp;_button\]:flex-1|max-sm:\[&_button\]:flex-1/)
})

test('gaveta: fechar de 44px no celular; gaveta do menu com 44px sempre', () => {
  const html = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: nada, titulo: 'Editar' }, 'x'))
  assert.match(html.match(/<button[^>]*aria-label="Fechar \(Esc\)"[^>]*>/)?.[0] ?? '', /max-sm:h-11/)
  const grande = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: nada, titulo: 'Menu', fecharGrande: true }, 'x'))
  const f = grande.match(/<button[^>]*aria-label="Fechar \(Esc\)"[^>]*>/)?.[0] ?? ''
  assert.match(f, /(^|\s|")h-11/)
  assert.match(f, /(^|\s)w-11/)
})

// ---------- 2. Alvos de toque ----------

test('IconButton tem 44px no celular por padrão, mas respeita quem já define tamanho', () => {
  const padrao = renderToStaticMarkup(h(IconButton, { rotulo: 'Editar', icone: 'i' }))
  assert.match(padrao, /max-sm:h-11/)
  assert.match(padrao, /h-\[34px\]/)
  const proprio = renderToStaticMarkup(h(IconButton, { rotulo: 'Editar', icone: 'i', className: 'h-8 w-8' }))
  assert.doesNotMatch(proprio, /max-sm:h-11/)
  assert.match(proprio, /h-8 w-8/)
})

test('Button p e m com altura mínima de 44px no celular; g já tem 44px', () => {
  assert.match(renderToStaticMarkup(h(Button, { tamanho: 'p' }, 'a')), /h-\[30px\][^"]*max-sm:min-h-11/)
  assert.match(renderToStaticMarkup(h(Button, null, 'a')), /h-9[^"]*max-sm:min-h-11/)
  assert.match(renderToStaticMarkup(h(Button, { tamanho: 'g' }, 'a')), /h-11/)
})

test('Input e Select com 44px no celular; Textarea com altura mínima', () => {
  assert.match(renderToStaticMarkup(h(Input, { 'aria-label': 'x' })), /h-9 max-sm:h-11/)
  assert.match(renderToStaticMarkup(h(Select, { 'aria-label': 'x' }, h('option', null, 'a'))), /max-sm:h-11/)
  const ta = renderToStaticMarkup(h(Textarea, { 'aria-label': 'x' }))
  assert.match(ta, /max-sm:min-h-11/)
  assert.doesNotMatch(ta, /max-sm:h-11/)
})

// ---------- 3. Aviso (toast) ----------

test('aviso fica acima dos botões flutuantes no celular e no canto no desktop; erro com borda', () => {
  assert.match(POSICAO_TOAST, /bottom-\[148px\]/)
  assert.match(POSICAO_TOAST, /lg:bottom-4/)
  assert.match(POSICAO_TOAST, /z-\[80\]/)
  const src = ler('components/ui/Toast.tsx')
  assert.match(src, /dng: 'border-danger\/60'/)
  assert.ok(!/Desfazer/.test(src), 'sem ação/Desfazer nesta fase')
})

// ---------- 4. Vazio e esqueleto ----------

test('EmptyState aceita ação e variante compacta', () => {
  const normal = renderToStaticMarkup(h(EmptyState, { icone: 'i', titulo: 'Nenhum cliente', acao: h('button', null, 'Limpar filtros') }))
  assert.match(normal, /py-12/)
  assert.match(normal, />Limpar filtros</)
  const compacto = renderToStaticMarkup(h(EmptyState, { icone: 'i', titulo: 'Nada', compacto: true }))
  assert.match(compacto, /py-6/)
  assert.match(compacto, /h-10 w-10/)
  assert.doesNotMatch(compacto, /py-12/)
})

test('Esqueleto: linhas e cartão anunciados como carregando, pulsar só com movimento liberado', () => {
  const linhas = renderToStaticMarkup(h(EsqueletoLinhas, { linhas: 4 }))
  assert.match(linhas, /role="status"/)
  assert.match(linhas, /aria-busy="true"/)
  assert.match(linhas, /class="sr-only">Carregando</)
  assert.equal((linhas.match(/motion-safe:animate-pulse/g) ?? []).length, 4)
  const cartao = renderToStaticMarkup(h(EsqueletoCartao))
  assert.match(cartao, /role="status"/)
  assert.match(cartao, /Carregando/)
  assert.ok(typeof ui.EsqueletoLinhas === 'function' && typeof ui.EsqueletoCartao === 'function', 'exportados em components/ui')
})

// ---------- 5. Casca ----------

const barra = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(h(BarraTopo, {
  profile: perfil(['fiscal']), setores: ['fiscal'], setorAtivo: 'fiscal', tema: 'dark', seletorMes: h('div', null, 'MES'),
  onTrocarSetor: nada, onAlternarTema: nada, onSair: nada, onAbrirMenu: nada, menuAberto: false, ...extra,
}))

test('título da página: rótulo do item ativo do menu, inclusive em subpáginas', () => {
  const g = montarMenu(admin, 'fiscal')
  assert.equal(tituloDaPagina(g, '/fiscal/clientes'), 'Clientes')
  assert.equal(tituloDaPagina(g, '/fiscal/clientes/abc'), 'Clientes')
  assert.equal(tituloDaPagina(g, '/admin/lixeira'), 'Lixeira')
  assert.equal(tituloDaPagina(g, '/fiscal/agenda'), null)
})

test('barra do topo no celular: título com reticências no lugar da marca', () => {
  const html = barra({ titulo: 'Clientes', tituloGrupo: 'Fiscal' })
  assert.match(html, /<p class="[^"]*truncate[^"]*lg:hidden[^"]*">.*Clientes<\/p>/)
  assert.match(html, /max-sm:hidden/)
  assert.match(html, /Fiscal · /)
  assert.doesNotMatch(barra(), /lg:hidden">.*<\/p>/)
})

test('Voltar só nas fichas de cliente dos setores, levando à lista do setor', () => {
  assert.equal(voltarDaFicha('/fiscal/clientes/123'), '/fiscal/clientes')
  assert.equal(voltarDaFicha('/financeiro/clientes/abc-1'), '/financeiro/clientes')
  assert.equal(voltarDaFicha('/fiscal/clientes'), null)
  assert.equal(voltarDaFicha('/clientes/123'), null)
  assert.equal(voltarDaFicha('/fiscal/clientes/1/outra'), null)
  const html = barra({ titulo: 'Clientes', voltarHref: '/contabil/clientes' })
  const link = html.match(/<a[^>]*aria-label="Voltar para a lista de clientes"[^>]*>/)?.[0] ?? ''
  assert.match(link, /href="\/contabil\/clientes"/)
  assert.match(link, /h-11 w-11/)
  assert.doesNotMatch(barra({ titulo: 'Clientes' }), /Voltar/)
})

test('h1 do cabeçalho igual ao título da barra só some da tela no celular; nome do cliente continua', () => {
  assert.equal(repeteTituloDaCasca('Clientes', 'Clientes'), true)
  assert.equal(repeteTituloDaCasca('Relatório', 'Relatórios'), false)
  assert.equal(repeteTituloDaCasca(h('span', null, 'Clientes'), 'Clientes'), false)
  const igual = renderToStaticMarkup(h(TituloCascaProvider, { titulo: 'Clientes', children: h(CabecalhoPagina, { titulo: 'Clientes', subtitulo: 'sub' }) }))
  assert.match(igual, /<h1 class="[^"]*max-sm:sr-only/)
  assert.match(igual, />sub</)
  const diferente = renderToStaticMarkup(h(TituloCascaProvider, { titulo: 'Clientes', children: h(CabecalhoPagina, { titulo: 'EMPRESA X' }) }))
  assert.doesNotMatch(diferente, /sr-only/)
})

test('mês compacto no celular sem perder o seletor do desktop', () => {
  const src = ler('components/shell/SeletorMes.tsx')
  assert.match(src, /MESES\[mes - 1\]\.slice\(0, 3\)/)
  assert.match(src, /sm:hidden/)
  assert.match(src, /hidden h-9 items-center[^"]*sm:flex/)
  assert.match(src, /aria-label="Mês anterior"|rotulo="Mês anterior"/)
})

test('Mais destacado com a gaveta aberta', () => {
  const atalhos = atalhosCelular(montarMenu(admin, 'fiscal'))
  const aberto = renderToStaticMarkup(h(BarraInferior, { atalhos, pathname: '/fiscal/dashboard', onMais: nada, menuAberto: true }))
  assert.match(aberto.match(/<button[^>]*>/)?.[0] ?? '', /text-acc-text/)
  const fechado = renderToStaticMarkup(h(BarraInferior, { atalhos, pathname: '/fiscal/dashboard', onMais: nada, menuAberto: false }))
  assert.match(fechado.match(/<button[^>]*>/)?.[0] ?? '', /text-fg-3/)
})

test('atalhos por setor: Financeiro e Societário pelos desenhos, demais como antes, sempre filtrados', () => {
  const rot = (p: PerfilMenu, s: Parameters<typeof montarMenu>[1]) => atalhosCelular(montarMenu(p, s)).map(rotuloCurto)
  assert.deepEqual(rot(admin, 'financeiro'), ['Receber', 'Pagar', 'Clientes'])
  assert.deepEqual(rot(admin, 'societario'), ['Procedim.', 'Clientes', 'Início'])
  assert.deepEqual(rot(admin, 'fiscal'), ['Início', 'Clientes', 'Tarefas'])
  assert.deepEqual(rot(admin, 'contabil'), ['Início', 'Clientes', 'Dashboard'])
  // operador do Financeiro que só vê Recebimentos e Relatórios: nada que ele não abre
  const op: PerfilMenu = { role: 'operador', setores: ['financeiro'], paginas_acesso: ['financeiro:recebimentos', 'financeiro:relatorios'] }
  const hrefs = atalhosCelular(montarMenu(op, 'financeiro')).map(i => i.href)
  const permitidos = montarMenu(op, 'financeiro').flatMap(g => g.itens.map(i => i.href))
  for (const href of hrefs) assert.ok(permitidos.includes(href), href)
  assert.equal(hrefs[0], '/financeiro/recebimentos')
  assert.ok(!hrefs.includes('/financeiro/pagamentos'))
})

test('barra inferior mostra rótulo curto e nome completo para leitor de tela', () => {
  const atalhos = atalhosCelular(montarMenu(admin, 'financeiro'))
  const html = renderToStaticMarkup(h(BarraInferior, { atalhos, pathname: '/financeiro/recebimentos', onMais: nada, menuAberto: false }))
  assert.match(html, /aria-label="Recebimentos"/)
  assert.match(html, />Receber</)
  assert.match(html, /md:hidden/)
})

test('tablet: trilho de 72px com ícone, rótulo curto e item ativo', () => {
  const g = montarMenu(admin, 'fiscal')
  const html = renderToStaticMarkup(h(TrilhoIcones, { grupos: g, pathname: '/fiscal/preenchimento-rapido' }))
  assert.match(html, /aria-label="Menu"/)
  const atual = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
  assert.equal(atual.length, 1)
  assert.match(atual[0], /href="\/fiscal\/preenchimento-rapido"/)
  assert.match(atual[0], /bg-acc-soft/)
  assert.match(html, />Preench\.</)
  assert.match(html, /min-h-11/)
  assert.doesNotMatch(html, /text-\[(9|10|11)px\]/)
  const shell = ler('components/shell/ShellCliente.tsx')
  assert.match(shell, /w-\[72px\][^"]*md:flex[^"]*lg:hidden/)
  assert.match(shell, /md:pb-0/)
})

test('gaveta com logo no cabeçalho e fechar de 44px', () => {
  const p = perfil(['fiscal'])
  const html = renderToStaticMarkup(h(GavetaMenu, {
    aberto: true, onFechar: nada, profile: p, grupos: montarMenu(p, 'fiscal'), pathname: '/',
    setores: ['fiscal'], setorAtivo: 'fiscal', tema: 'dark', onTrocarSetor: nada, onAlternarTema: nada, onSair: nada,
  }))
  assert.match(html, /<h2[^>]*>.*<img[^>]*logo\.ico.*Tesserato/)
  assert.match(ler('components/shell/GavetaMenu.tsx'), /fecharGrande/)
})

test('link "Pular para o conteúdo" escondido até o foco, apontando para #conteudo', () => {
  const shell = ler('components/shell/ShellCliente.tsx')
  assert.match(shell, /href="#conteudo"[\s\S]*sr-only[^"]*focus:not-sr-only[\s\S]*Pular para o conteúdo/)
  assert.match(shell, /<main id="conteudo" tabIndex=\{-1\}/)
})

test('casca não mexe em permissão: menu e atalhos continuam vindo do servidor', () => {
  const shell = ler('components/shell/PortalShell.tsx')
  assert.match(shell, /montarMenu\(profile, setorAtivo\)/)
  assert.match(shell, /atalhosCelular\(grupos\)/)
})

// ---------- 8. Vínculos ----------

test('selo de vínculo sem símbolo e sem .replace nas telas', () => {
  assert.equal(formatarBadgeVinculo({ liberada: true, concluidos: 1, total: 1, setorOrigemLabel: 'Fiscal' }).texto, 'Liberada por Fiscal')
  assert.equal(formatarBadgeVinculo({ liberada: false, concluidos: 1, total: 3, setorOrigemLabel: 'Fiscal' }).texto, 'Aguardando (1/3 concluídas)')
  assert.doesNotMatch(ler('lib/vinculos.ts'), /[✓⏳]/)
  for (const arq of [
    'components/fiscal/ClientesLista.tsx', 'components/contabil/ClientesListaContabil.tsx', 'components/pessoal/ClientesListaPessoal.tsx',
    'components/societario/ClientesListaSocietario.tsx', 'components/financeiro/ClientesListaFinanceiro.tsx',
    'components/fiscal/TarefaChecklist.tsx', 'components/contabil/TarefaChecklistContabil.tsx', 'components/pessoal/TarefaChecklistPessoal.tsx',
  ]) {
    assert.ok(!ler(arq).includes(".replace(/^(✓|⏳)"), arq)
  }
})

// ---------- 9. globals.css ----------

test('globals.css: sem apelidos antigos nem .no-print/.print-only; reduzir movimento respeitado', () => {
  const css = ler('app/globals.css')
  for (const nome of ['--bg-page', '--bg-surface', '--bg-surface-2', '--accent', '--accent-hover', '--accent-ink']) {
    assert.ok(!css.includes(`${nome}:`) && !css.includes(`var(${nome})`), nome)
  }
  assert.ok(!css.includes('.no-print') && !css.includes('.print-only'))
  assert.match(css, /body \{\n {2}background: var\(--page\);/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation-duration: 0\.01ms !important;[\s\S]*transition-duration: 0\.01ms !important;/)
})

test('globals.css: sem o remendo do tema claro para text-[var(--fg)]/NN (nenhuma tela usa mais)', () => {
  assert.ok(!ler('app/contabil/page.tsx').includes('[var(--fg)]'))
  assert.ok(!ler('app/globals.css').includes(String.raw`\[var\(--fg\)\]`))
})
