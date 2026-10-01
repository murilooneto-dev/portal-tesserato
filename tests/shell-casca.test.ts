import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BarraTopo } from '../components/shell/BarraTopo'
import { GavetaMenu } from '../components/shell/GavetaMenu'
import { BarraInferior } from '../components/shell/BarraInferior'
import { montarMenu, atalhosCelular } from '../lib/navegacao'
import type { Profile } from '../lib/types'

const ROOT = join(__dirname, '..')
const nada = () => {}
const perfil = (setores: Profile['setores'], role: Profile['role'] = 'operador'): Profile =>
  ({ id: 'u1', nome: 'Admin Dev', role, setores, cor: '#6366f1', created_at: '2026-01-01', paginas_acesso: [] }) as Profile

const barra = (p: Profile, setores: Profile['setores']) => renderToStaticMarkup(h(BarraTopo, {
  profile: p, setores, setorAtivo: 'fiscal', tema: 'dark', seletorMes: h('div', null, 'MES'),
  onTrocarSetor: nada, onAlternarTema: nada, onSair: nada, onAbrirMenu: nada,
}))

test('barra do topo: marca, mês, tema, conta e um único Sair', () => {
  const html = barra(perfil(['fiscal', 'contabil']), ['fiscal', 'contabil'])
  assert.match(html, /Tesserato/)
  assert.match(html, />MES</)
  assert.match(html, /aria-label="Usar tema claro"/)
  assert.match(html, /Admin Dev/)
  assert.equal((html.match(/aria-label="Sair"/g) ?? []).length, 1)
  assert.match(html, /aria-label="Abrir menu"/)
})

test('abas de setor só com mais de um setor, com o atual marcado', () => {
  const multi = barra(perfil(['fiscal', 'contabil']), ['fiscal', 'contabil'])
  assert.match(multi, /<nav[^>]*aria-label="Setores"/)
  assert.match(multi, /aria-current="page"[^>]*>Fiscal</)
  assert.doesNotMatch(barra(perfil(['fiscal']), ['fiscal']), /aria-label="Setores"/)
})

test('barra do topo, menu e barra inferior saem da impressão', () => {
  assert.match(barra(perfil(['fiscal']), ['fiscal']), /<header[^>]*print:hidden/)
  const inf = renderToStaticMarkup(h(BarraInferior, { atalhos: atalhosCelular(montarMenu(perfil(['fiscal'], 'admin'), 'fiscal')), pathname: '/fiscal/dashboard', onMais: nada }))
  assert.match(inf, /<nav[^>]*print:hidden/)
  const shell = readFileSync(join(ROOT, 'components', 'shell', 'ShellCliente.tsx'), 'utf8')
  assert.match(shell, /print:hidden/)
})

test('barra inferior: atalhos com a página atual e o botão Mais, alvos de 44 px', () => {
  const inf = renderToStaticMarkup(h(BarraInferior, { atalhos: atalhosCelular(montarMenu(perfil(['fiscal'], 'admin'), 'fiscal')), pathname: '/fiscal/clientes', onMais: nada }))
  assert.match(inf, /aria-label="Atalhos"/)
  assert.match(inf, /aria-current="page"[^>]*href="\/fiscal\/clientes"|href="\/fiscal\/clientes"[^>]*aria-current="page"/)
  assert.match(inf, />Mais</)
  assert.match(inf, /lg:hidden/)
  assert.match(inf, /min-h-11|h-16/)
})

test('gaveta: diálogo à esquerda com troca de setor, menu e Sair', () => {
  const p = perfil(['fiscal', 'contabil'])
  const html = renderToStaticMarkup(h(GavetaMenu, {
    aberto: true, onFechar: nada, profile: p, grupos: montarMenu(p, 'fiscal'), pathname: '/fiscal/dashboard',
    setores: ['fiscal', 'contabil'], setorAtivo: 'fiscal', tema: 'dark', onTrocarSetor: nada, onAlternarTema: nada, onSair: nada,
  }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /left-0/)
  assert.match(html, /<select[^>]*aria-label="Setor"|aria-label="Setor"[^>]*<select/)
  assert.match(html, /aria-label="Menu"/)
  assert.match(html, /aria-label="Sair"/)
  assert.match(html, /aria-label="Usar tema claro"/)
})

test('gaveta sem troca de setor quando há um setor só', () => {
  const p = perfil(['fiscal'])
  const html = renderToStaticMarkup(h(GavetaMenu, {
    aberto: true, onFechar: nada, profile: p, grupos: montarMenu(p, 'fiscal'), pathname: '/',
    setores: ['fiscal'], setorAtivo: 'fiscal', tema: 'dark', onTrocarSetor: nada, onAlternarTema: nada, onSair: nada,
  }))
  assert.doesNotMatch(html, /aria-label="Setor"/)
})

test('componentes antigos da casca foram removidos e ninguém mais os importa', () => {
  for (const f of ['TopNav.tsx', 'Sidebar.tsx', 'MesSeletor.tsx']) {
    assert.equal(existsSync(join(ROOT, 'components', 'fiscal', f)), false, `${f} ainda existe`)
  }
  const arquivos = (d: string): string[] => readdirSync(d).flatMap(n => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []
  })
  const ruins = [...arquivos(join(ROOT, 'app')), ...arquivos(join(ROOT, 'components')), ...arquivos(join(ROOT, 'lib'))]
    .filter(f => /fiscal\/(TopNav|Sidebar|MesSeletor)['"]/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(ruins, [])
})
