# Redesign — Fase 2: Casca (navegação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a moldura de todas as telas (barra do topo, menu lateral, mês de trabalho, menu no celular, telas de carregando, erro e não encontrada) pelo desenho aprovado, sem mexer no conteúdo das páginas.

**Architecture:** A regra de "o que aparece no menu" sai dos componentes e vira funções puras em `lib/navegacao.ts` e `lib/mes-navegacao.ts` (testáveis sem navegador). A casca é montada por `components/shell/PortalShell.tsx` (servidor), que calcula o menu e entrega a um componente cliente (`ShellCliente`) com a barra do topo, o menu lateral, a gaveta e a barra inferior do celular. As partes visuais recebem tudo por props (sem hooks de rota), para serem testadas com `renderToStaticMarkup`; só o `ShellCliente` e o `SeletorMes` usam `useRouter`/`usePathname`. As peças de `components/ui/` (Fase 1) são reaproveitadas.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2, Tailwind CSS v4 (classes do Design System via `@theme inline`), `lucide-react`, `tailwind-merge` (novo), testes `node --import tsx --test "tests/**/*.test.ts"`.

**Spec:** `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (Fase 2) + mockups `nav-01-desktop`, `nav-02-tema-claro`, `nav-03-celular`, `nav-04-celular-menu`, `e-03`…`e-05` (cópia local em `D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\`; original no artifact https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV).

## Global Constraints

- Worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f2`, branch `feat/redesign-fase2-casca` (criada de `origin/dev` c4375fd). PR **contra `dev`**, sem merge.
- **Nenhuma migration, nenhuma mudança de banco.** Não mexer em `lib/get-portal-context.ts`, `lib/route-permissions.ts`, `proxy.ts` nem nos layouts além de trocar o que eles renderizam.
- Permissões: o menu usa **a mesma regra** que o servidor já aplica (`podeAcessarPagina` de `lib/route-permissions.ts`), só para **esconder** o que o usuário não pode abrir. Nunca libera nada.
- Barra do topo (desenho aprovado): logo + "Tesserato" · abas de setor (só se o usuário tiver mais de 1 setor) · mês de trabalho com setas `‹ Setembro 2026 ›` · botão de tema (ícone) · avatar, nome, perfil e **um único "Sair"**.
- Menu lateral: 248 px, três grupos — **Geral** (Início, Cadastro de clientes, Ferramentas), **o setor aberto** (páginas que o usuário pode abrir) e **Administração** no rodapé (Configurações, Vínculos de tarefas, Parâmetros, Lixeira, conforme o perfil). Página atual com fundo `bg-acc-soft`, ícone `text-acc-text` e `aria-current="page"`. O mês, o tema e a conta **saem** do menu lateral.
- Abaixo de 1024 px (`lg`): o menu lateral some; botão de menu (44 px) abre uma **gaveta à esquerda** com troca de setor, o mesmo menu e a conta; **barra inferior** fixa com 4 atalhos (Início, até 2 páginas do setor, "Mais" que abre a gaveta), alvos de 44 px.
- Rótulos em português, só a primeira letra maiúscula ("Preenchimento rápido", "Minhas tarefas").
- Texto mínimo 12 px. Cores só pelas classes do Design System (`bg-top`, `bg-nav`, `text-fg-2`, `border-line-soft`…).
- Impressão: barra do topo, menu e barra inferior ficam **fora da impressão** (`print:hidden`), como hoje.
- Peças em `components/ui/` importam só `react`, `react-dom`, `lucide-react`, `tailwind-merge` e arquivos de `components/ui/`.
- `npx tsc --noEmit` limpo (tsconfig ES2017: sem flag `/s` em regex). Não ler `.env*`.

## Review Focus

1. **Operador de um setor só, sem páginas liberadas** (`setores: ['fiscal']`, `paginas_acesso: []`): barra do topo **sem** abas de setor; menu com Geral + Fiscal só com Dashboard; sem grupo Administração. Teste na Task 2.
2. **Setor sem página liberada nenhuma** (Societário sem `procedimentos`/`clientes`/`tabelas` liberados): o grupo do setor **some** em vez de aparecer vazio. Teste na Task 2.
3. **Virada de ano no mês de trabalho**: seta para trás em janeiro vai a dezembro do ano anterior; para frente em dezembro vai a janeiro do seguinte. Teste na Task 3.
4. **Página atual com prefixo parecido**: `/fiscal/tabelas/123` marca "Tabelas"; `/clientes-antigos` **não** marca "Cadastro de clientes" (`/clientes`). Teste na Task 2.
5. **Impressão**: barra do topo, menu lateral e barra inferior com `print:hidden`. Teste na Task 5.

---

## Task 0: Preparar o worktree

**Files:** nenhum arquivo de código.

- [ ] **Step 1:** `npm ci` → termina sem erro.
- [ ] **Step 2:** `npm test` → anotar a linha de base (`# pass N`, `# fail 0`).
- [ ] **Step 3:** Commitar o plano:

```bash
git add docs/superpowers/plans/2026-10-01-redesign-fase2-casca.md
git commit -m "docs: plano da Fase 2 do redesign (casca)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 1: `cn` com tailwind-merge e gaveta à esquerda

Achado da revisão final da Fase 1: sem merge de classes, um `className` do chamador (`h-11`, `px-4`) não vence com certeza a classe padrão da peça. A casca precisa disso (botões de 44 px no celular). A gaveta do celular abre pela **esquerda**; o `Drawer` hoje só abre pela direita.

**Files:**
- Modify: `package.json` / `package-lock.json` (dependência `tailwind-merge`)
- Modify: `components/ui/cn.ts`
- Modify: `components/ui/Modal.tsx` (prop `lado` no `Drawer`)
- Modify: `components/ui/README.md` (regra de imports)
- Create: `tests/ui-cn-gaveta.test.ts`

**Interfaces:**
- Produces: `cn(...partes)` — mesma assinatura; agora resolve conflito de classes Tailwind (a última vence). `Drawer` ganha `lado?: 'esquerda' | 'direita'` (padrão `'direita'`): `'esquerda'` usa `left-0` e `border-r`, `'direita'` usa `right-0` e `border-l`.

- [ ] **Step 1: Teste que falha** — `tests/ui-cn-gaveta.test.ts`:

```ts
// tests/ui-cn-gaveta.test.ts — merge de classes e gaveta pela esquerda.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '../components/ui/cn'
import { Drawer } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

test('cn: a última classe em conflito vence', () => {
  assert.equal(cn('h-9 px-3', 'h-11'), 'px-3 h-11')
  assert.equal(cn('text-sm', false, 'text-[15px]'), 'text-[15px]')
  assert.equal(cn('a', null, undefined, 'b'), 'a b')
})

test('className do chamador vence a altura padrão do botão', () => {
  const html = renderToStaticMarkup(h(Button, { className: 'h-11' }, 'Ok'))
  assert.match(html, /\bh-11\b/)
  assert.doesNotMatch(html, /\bh-9\b/)
})

test('gaveta abre pela esquerda quando pedido', () => {
  const esq = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Menu', lado: 'esquerda' }, 'x'))
  assert.match(esq, /left-0/)
  assert.match(esq, /border-r/)
  assert.doesNotMatch(esq, /right-0/)
  const dir = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Editar' }, 'x'))
  assert.match(dir, /right-0/)
})
```

- [ ] **Step 2:** `node --import tsx --test tests/ui-cn-gaveta.test.ts` → FAIL (`cn` não junta conflito; `lado` não existe).

- [ ] **Step 3: Implementar**
  - `npm install tailwind-merge@^3` (versão 3 é a que suporta Tailwind v4).
  - `components/ui/cn.ts`:

```ts
import { twMerge } from 'tailwind-merge'

// Junta classes CSS ignorando valores falsos; em conflito do Tailwind
// (ex.: h-9 e h-11), a última vence — assim o className do chamador manda.
export function cn(...partes: (string | false | null | undefined)[]): string {
  return twMerge(partes.filter(Boolean).join(' '))
}
```

  - `components/ui/Modal.tsx`, componente `Drawer`: acrescentar a prop `lado = 'direita'` à desestruturação e ao tipo (`BaseProps & { larguraPx?: number; lado?: 'esquerda' | 'direita' }`), e no painel trocar a classe fixa `absolute right-0 top-0 … border-l` por:

```tsx
className={cn(
  'absolute top-0 flex h-full flex-col border-line bg-surface shadow-modal',
  lado === 'esquerda' ? 'left-0 border-r' : 'right-0 border-l',
)}
```

  - `components/ui/README.md`: na linha das regras, deixar claro que as peças podem importar `tailwind-merge`.

- [ ] **Step 4:** focado passa; `npm test` (linha de base + 3, sem falhas — os testes antigos de `cn('a', false, null, undefined, 'b') === 'a b'` continuam passando); `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components/ui/cn.ts components/ui/Modal.tsx components/ui/README.md tests/ui-cn-gaveta.test.ts
git commit -m "feat(ui): cn com tailwind-merge e gaveta que abre pela esquerda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Modelo do menu (`lib/navegacao.ts`)

**Files:**
- Create: `lib/navegacao.ts`
- Modify: `lib/paginas-setor.ts` (rótulos em minúscula: `'Preenchimento Rápido'` → `'Preenchimento rápido'`, `'Minhas Tarefas'` → `'Minhas tarefas'`, onde existirem)
- Create: `tests/navegacao.test.ts`

**Interfaces:**
- Consumes: `PAGINAS_POR_SETOR` (`lib/paginas-setor.ts`), `podeAcessarPagina` (`lib/route-permissions.ts`), `SETORES`, `SETOR_LABEL`, tipos `Profile`, `UserSetor` (`lib/types.ts`).
- Produces (exatos):
  - `type IconeMenu = 'inicio' | 'cadastro' | 'ferramentas' | 'dashboard' | 'clientes' | 'calendario' | 'relatorios' | 'parcelamentos' | 'preenchimento' | 'minhas-tarefas' | 'procedimentos' | 'tabelas' | 'recebimentos' | 'pagamentos' | 'configuracoes' | 'vinculos' | 'parametros' | 'lixeira' | 'em-construcao'`
  - `interface ItemMenu { href: string; rotulo: string; icone: IconeMenu }`
  - `interface GrupoMenu { id: 'geral' | 'setor' | 'admin'; titulo: string; itens: ItemMenu[] }`
  - `ITENS_GERAIS: ItemMenu[]`
  - `montarMenu(profile: PerfilMenu, setorAtivo: UserSetor): GrupoMenu[]` — grupos não vazios, na ordem geral → setor → admin.
  - `estaAtivo(pathname: string, href: string): boolean`
  - `setoresVisiveis(profile: PerfilMenu): UserSetor[]` — sem `configuracoes`.
  - `atalhosCelular(grupos: GrupoMenu[]): ItemMenu[]` — Início + até 2 primeiros itens do grupo do setor.
  - `type PerfilMenu = Pick<Profile, 'role' | 'setores' | 'paginas_acesso'>`

- [ ] **Step 1: Teste que falha** — `tests/navegacao.test.ts`:

```ts
// tests/navegacao.test.ts — o que aparece no menu, por perfil.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarMenu, estaAtivo, setoresVisiveis, atalhosCelular, ITENS_GERAIS, type PerfilMenu } from '../lib/navegacao'

const admin: PerfilMenu = { role: 'admin', setores: ['fiscal'], paginas_acesso: [] }
const operadorFiscal: PerfilMenu = { role: 'operador', setores: ['fiscal'], paginas_acesso: [] }
const operadorClientes: PerfilMenu = { role: 'operador', setores: ['fiscal', 'contabil'], paginas_acesso: ['fiscal:clientes', 'fiscal:relatorios'] }

const rotulos = (grupos: ReturnType<typeof montarMenu>, id: string) => grupos.find(g => g.id === id)?.itens.map(i => i.rotulo)

test('grupo Geral fixo: Início, Cadastro de clientes, Ferramentas', () => {
  assert.deepEqual(ITENS_GERAIS.map(i => [i.rotulo, i.href]), [
    ['Início', '/intranet'], ['Cadastro de clientes', '/clientes'], ['Ferramentas', '/ferramentas'],
  ])
})

test('admin vê todas as páginas do setor e o grupo Administração', () => {
  const g = montarMenu(admin, 'fiscal')
  assert.deepEqual(g.map(x => x.id), ['geral', 'setor', 'admin'])
  assert.equal(g[1].titulo, 'Fiscal')
  assert.deepEqual(rotulos(g, 'setor'), ['Dashboard', 'Clientes', 'Calendário', 'Relatórios', 'Parcelamentos', 'Preenchimento rápido', 'Minhas tarefas', 'Tabelas'])
  assert.deepEqual(rotulos(g, 'admin'), ['Configurações', 'Vínculos de tarefas', 'Parâmetros', 'Lixeira'])
  assert.equal(g[1].itens[0].href, '/fiscal/dashboard')
})

test('operador de um setor sem páginas liberadas vê só o Dashboard e nada de Administração', () => {
  const g = montarMenu(operadorFiscal, 'fiscal')
  assert.deepEqual(g.map(x => x.id), ['geral', 'setor'])
  assert.deepEqual(rotulos(g, 'setor'), ['Dashboard'])
})

test('operador vê só as páginas liberadas, na ordem do menu', () => {
  assert.deepEqual(rotulos(montarMenu(operadorClientes, 'fiscal'), 'setor'), ['Dashboard', 'Clientes', 'Relatórios'])
})

test('setor sem nenhuma página liberada não aparece vazio', () => {
  const soc: PerfilMenu = { role: 'operador', setores: ['societario'], paginas_acesso: [] }
  assert.deepEqual(montarMenu(soc, 'societario').map(x => x.id), ['geral'])
})

test('setor Configurações aparece para quem tem o setor, com Configurações em Administração', () => {
  const cfg: PerfilMenu = { role: 'operador', setores: ['configuracoes'], paginas_acesso: ['configuracoes:fiscal'] }
  const g = montarMenu(cfg, 'configuracoes')
  assert.deepEqual(rotulos(g, 'setor'), ['Fiscal'])
  assert.equal(g.find(x => x.id === 'setor')!.itens[0].href, '/admin/configuracoes/fiscal')
  assert.deepEqual(rotulos(g, 'admin'), ['Configurações'])
})

test('página atual: igual ou subpágina, nunca prefixo parecido', () => {
  assert.equal(estaAtivo('/fiscal/tabelas/123', '/fiscal/tabelas'), true)
  assert.equal(estaAtivo('/fiscal/tabelas', '/fiscal/tabelas'), true)
  assert.equal(estaAtivo('/clientes-antigos', '/clientes'), false)
  assert.equal(estaAtivo('/fiscal/clientes', '/clientes'), false)
})

test('abas de setor: sem Configurações; admin vê todos os setores de trabalho', () => {
  assert.deepEqual(setoresVisiveis(admin), ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'])
  assert.deepEqual(setoresVisiveis({ role: 'operador', setores: ['contabil', 'configuracoes'], paginas_acesso: [] }), ['contabil'])
})

test('atalhos do celular: Início e até duas páginas do setor', () => {
  assert.deepEqual(atalhosCelular(montarMenu(admin, 'fiscal')).map(i => i.rotulo), ['Início', 'Dashboard', 'Clientes'])
  assert.deepEqual(atalhosCelular(montarMenu(operadorFiscal, 'fiscal')).map(i => i.rotulo), ['Início', 'Dashboard'])
  assert.deepEqual(atalhosCelular(montarMenu({ role: 'operador', setores: ['societario'], paginas_acesso: [] }, 'societario')).map(i => i.rotulo), ['Início'])
})
```

- [ ] **Step 2:** `node --import tsx --test tests/navegacao.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `lib/navegacao.ts`:

```ts
// lib/navegacao.ts
//
// O que aparece no menu, por perfil. Funções puras (sem React) para testar
// sem navegador. A permissão usa a MESMA regra do servidor
// (podeAcessarPagina), só para esconder o que o usuário não pode abrir —
// quem bloqueia de verdade continua sendo o proxy e o getPortalContext.
import { SETORES, SETOR_LABEL, type Profile, type UserSetor } from './types'
import { PAGINAS_POR_SETOR } from './paginas-setor'
import { podeAcessarPagina } from './route-permissions'

export type IconeMenu =
  | 'inicio' | 'cadastro' | 'ferramentas' | 'dashboard' | 'clientes' | 'calendario'
  | 'relatorios' | 'parcelamentos' | 'preenchimento' | 'minhas-tarefas' | 'procedimentos'
  | 'tabelas' | 'recebimentos' | 'pagamentos' | 'configuracoes' | 'vinculos'
  | 'parametros' | 'lixeira' | 'em-construcao'

export interface ItemMenu { href: string; rotulo: string; icone: IconeMenu }
export interface GrupoMenu { id: 'geral' | 'setor' | 'admin'; titulo: string; itens: ItemMenu[] }
export type PerfilMenu = Pick<Profile, 'role' | 'setores' | 'paginas_acesso'>

export const ITENS_GERAIS: ItemMenu[] = [
  { href: '/intranet', rotulo: 'Início', icone: 'inicio' },
  { href: '/clientes', rotulo: 'Cadastro de clientes', icone: 'cadastro' },
  { href: '/ferramentas', rotulo: 'Ferramentas', icone: 'ferramentas' },
]

const ICONE_PAGINA: Record<string, IconeMenu> = {
  dashboard: 'dashboard',
  clientes: 'clientes',
  calendario: 'calendario',
  relatorios: 'relatorios',
  parcelamentos: 'parcelamentos',
  'preenchimento-rapido': 'preenchimento',
  'minhas-tarefas': 'minhas-tarefas',
  procedimentos: 'procedimentos',
  tabelas: 'tabelas',
  recebimentos: 'recebimentos',
  pagamentos: 'pagamentos',
}

function itensDoSetor(profile: PerfilMenu, setor: UserSetor): ItemMenu[] {
  const paginas = PAGINAS_POR_SETOR[setor]
  if (paginas.length === 0) return [{ href: `/${setor}`, rotulo: 'Em construção', icone: 'em-construcao' }]
  const prefixo = setor === 'configuracoes' ? '/admin/configuracoes' : `/${setor}`
  return paginas
    .filter(p => podeAcessarPagina(profile, setor, p.slug))
    .map(p => ({
      href: `${prefixo}/${p.slug}`,
      rotulo: p.label,
      icone: ICONE_PAGINA[p.slug] ?? (setor === 'configuracoes' ? 'configuracoes' : 'em-construcao'),
    }))
}

function itensAdmin(profile: PerfilMenu): ItemMenu[] {
  const itens: ItemMenu[] = []
  const ehAdmin = profile.role === 'admin'
  if (ehAdmin || (profile.setores ?? []).includes('configuracoes')) {
    itens.push({ href: '/admin/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' })
  }
  if (ehAdmin) {
    itens.push(
      { href: '/vinculos', rotulo: 'Vínculos de tarefas', icone: 'vinculos' },
      { href: '/fiscal/parametros', rotulo: 'Parâmetros', icone: 'parametros' },
      { href: '/admin/lixeira', rotulo: 'Lixeira', icone: 'lixeira' },
    )
  }
  return itens
}

export function montarMenu(profile: PerfilMenu, setorAtivo: UserSetor): GrupoMenu[] {
  const grupos: GrupoMenu[] = [
    { id: 'geral', titulo: 'Geral', itens: ITENS_GERAIS },
    { id: 'setor', titulo: SETOR_LABEL[setorAtivo], itens: itensDoSetor(profile, setorAtivo) },
    { id: 'admin', titulo: 'Administração', itens: itensAdmin(profile) },
  ]
  return grupos.filter(g => g.itens.length > 0)
}

export function estaAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function setoresVisiveis(profile: PerfilMenu): UserSetor[] {
  const base = profile.role === 'admin' ? SETORES : (profile.setores ?? [])
  return base.filter(s => s !== 'configuracoes')
}

export function atalhosCelular(grupos: GrupoMenu[]): ItemMenu[] {
  const doSetor = grupos.find(g => g.id === 'setor')?.itens ?? []
  return [ITENS_GERAIS[0], ...doSetor.slice(0, 2)]
}
```

  E em `lib/paginas-setor.ts`, trocar os rótulos `'Preenchimento Rápido'` por `'Preenchimento rápido'` e `'Minhas Tarefas'` por `'Minhas tarefas'` em todos os setores onde aparecem (o `slug` não muda — permissões usam o slug).

- [ ] **Step 4:** focado passa (9 testes); `npm test` sem falhas (se algum teste antigo comparar o rótulo antigo, atualizar só esse rótulo e citar no relatório); `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/navegacao.ts lib/paginas-setor.ts tests/navegacao.test.ts
git commit -m "feat(casca): modelo do menu por perfil, com as mesmas regras de permissão do servidor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Mês de trabalho no topo (`lib/mes-navegacao.ts` + `SeletorMes`)

**Files:**
- Create: `lib/mes-navegacao.ts`
- Create: `components/shell/SeletorMes.tsx`
- Create: `tests/mes-navegacao.test.ts`

**Interfaces:**
- Consumes: `definirMesAno(mes, ano)` (`lib/mes-atual-actions.ts`, server action existente — não alterar), `IconButton` e `cn` (`components/ui`).
- Produces:
  - `MESES: readonly string[]` (Janeiro…Dezembro)
  - `mesVizinho(mes: number, ano: number, delta: -1 | 1): { mes: number; ano: number }`
  - `rotuloMes(mes: number, ano: number): string` → `"Setembro 2026"`
  - `SeletorMes({ mes, ano }: { mes: number; ano: number })` — client; grupo `role="group"` `aria-label="Mês de trabalho"` com `IconButton` "Mês anterior", um `<select aria-label="Escolher mês">` com os 12 meses do ano mostrado e `IconButton` "Próximo mês". Ao mudar: `definirMesAno` e `router.refresh()` dentro de `useTransition`; tudo desabilitado enquanto pendente.

- [ ] **Step 1: Teste que falha** — `tests/mes-navegacao.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MESES, mesVizinho, rotuloMes } from '../lib/mes-navegacao'

test('meses por extenso', () => {
  assert.equal(MESES.length, 12)
  assert.equal(MESES[0], 'Janeiro')
  assert.equal(MESES[8], 'Setembro')
})

test('mês vizinho dentro do ano', () => {
  assert.deepEqual(mesVizinho(9, 2026, 1), { mes: 10, ano: 2026 })
  assert.deepEqual(mesVizinho(9, 2026, -1), { mes: 8, ano: 2026 })
})

test('mês vizinho vira o ano', () => {
  assert.deepEqual(mesVizinho(1, 2026, -1), { mes: 12, ano: 2025 })
  assert.deepEqual(mesVizinho(12, 2026, 1), { mes: 1, ano: 2027 })
})

test('rótulo do mês', () => {
  assert.equal(rotuloMes(9, 2026), 'Setembro 2026')
})

test('seletor usa a ação existente e atualiza a página', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'shell', 'SeletorMes.tsx'), 'utf8')
  assert.match(src, /^'use client'/)
  assert.match(src, /definirMesAno\(/)
  assert.match(src, /router\.refresh\(\)/)
  assert.match(src, /aria-label="Mês de trabalho"/)
  assert.match(src, /rotulo="Mês anterior"/)
  assert.match(src, /rotulo="Próximo mês"/)
})
```

- [ ] **Step 2:** rodar → FAIL.

- [ ] **Step 3: Implementar**

`lib/mes-navegacao.ts`:

```ts
// lib/mes-navegacao.ts — navegação do mês de trabalho (funções puras).
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] as const

export function mesVizinho(mes: number, ano: number, delta: -1 | 1): { mes: number; ano: number } {
  const indice = ano * 12 + (mes - 1) + delta
  return { mes: (indice % 12) + 1, ano: Math.floor(indice / 12) }
}

export function rotuloMes(mes: number, ano: number): string {
  return `${MESES[mes - 1]} ${ano}`
}
```

`components/shell/SeletorMes.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { definirMesAno } from '@/lib/mes-atual-actions'
import { MESES, mesVizinho } from '@/lib/mes-navegacao'

export default function SeletorMes({ mes, ano }: { mes: number; ano: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  function ir(novoMes: number, novoAno: number) {
    iniciar(async () => {
      await definirMesAno(novoMes, novoAno)
      router.refresh()
    })
  }

  const anterior = mesVizinho(mes, ano, -1)
  const proximo = mesVizinho(mes, ano, 1)

  return (
    <div role="group" aria-label="Mês de trabalho" className="flex h-9 items-center rounded-[10px] border border-line bg-surface">
      <IconButton rotulo="Mês anterior" icone={<ChevronLeft size={16} aria-hidden="true" />} onClick={() => ir(anterior.mes, anterior.ano)} disabled={pendente} className="h-[34px] w-8" />
      <select
        aria-label="Escolher mês"
        value={mes}
        disabled={pendente}
        onChange={e => ir(Number(e.target.value), ano)}
        className="h-[34px] min-w-[120px] cursor-pointer appearance-none bg-transparent px-1 text-center text-sm font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-60 sm:min-w-[140px]"
      >
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1} className="bg-surface text-fg">{nome} {ano}</option>
        ))}
      </select>
      <IconButton rotulo="Próximo mês" icone={<ChevronRight size={16} aria-hidden="true" />} onClick={() => ir(proximo.mes, proximo.ano)} disabled={pendente} className="h-[34px] w-8" />
    </div>
  )
}
```

- [ ] **Step 4:** focado passa (5); `npm test`; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/mes-navegacao.ts components/shell/SeletorMes.tsx tests/mes-navegacao.test.ts
git commit -m "feat(casca): mês de trabalho com setas, pronto para a barra do topo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Menu lateral (`MenuLateral`)

**Files:**
- Create: `components/shell/icones-menu.ts`
- Create: `components/shell/MenuLateral.tsx`
- Create: `tests/shell-menu.test.ts`

**Interfaces:**
- Consumes: `GrupoMenu`, `ItemMenu`, `IconeMenu`, `estaAtivo` (`lib/navegacao.ts`), `cn`.
- Produces:
  - `ICONE: Record<IconeMenu, LucideIcon>` (em `icones-menu.ts`)
  - `MenuLateral(props: { grupos: GrupoMenu[]; pathname: string; toque?: boolean; onNavegar?: () => void; className?: string })` — sem hooks. `<nav aria-label="Menu">`; grupos `geral` e `setor` com título (texto 12 px, maiúsculas, `text-fg-3`); grupo `admin` empurrado para o rodapé (`mt-auto`, borda em cima). Item: `Link` com ícone 18 px; ativo → `bg-acc-soft text-fg` + ícone `text-acc-text` + `aria-current="page"`; inativo → `text-fg-2 hover:bg-raised hover:text-fg`. Altura 38 px, ou 44 px com `toque`. `onNavegar` é chamado no clique de qualquer item (a gaveta usa para fechar).

- [ ] **Step 1: Teste que falha** — `tests/shell-menu.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MenuLateral } from '../components/shell/MenuLateral'
import { ICONE } from '../components/shell/icones-menu'
import { montarMenu, type IconeMenu } from '../lib/navegacao'

const grupos = montarMenu({ role: 'admin', setores: ['fiscal'], paginas_acesso: [] }, 'fiscal')

test('menu com os três grupos e títulos', () => {
  const html = renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/fiscal/clientes' }))
  assert.match(html, /<nav[^>]*aria-label="Menu"/)
  assert.match(html, />Geral</)
  assert.match(html, />Fiscal</)
  assert.match(html, /Lixeira/)
})

test('página atual marcada para leitor de tela', () => {
  const html = renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/fiscal/clientes/abc' }))
  const atual = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
  assert.equal(atual.length, 1)
  assert.match(atual[0], /href="\/fiscal\/clientes"/)
  assert.match(atual[0], /bg-acc-soft/)
})

test('alvo de toque de 44 px na gaveta', () => {
  assert.match(renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/', toque: true })), /h-11/)
  assert.match(renderToStaticMarkup(h(MenuLateral, { grupos, pathname: '/' })), /h-\[38px\]/)
})

test('todo ícone do modelo tem desenho', () => {
  const todos: IconeMenu[] = ['inicio', 'cadastro', 'ferramentas', 'dashboard', 'clientes', 'calendario', 'relatorios', 'parcelamentos', 'preenchimento', 'minhas-tarefas', 'procedimentos', 'tabelas', 'recebimentos', 'pagamentos', 'configuracoes', 'vinculos', 'parametros', 'lixeira', 'em-construcao']
  for (const i of todos) assert.ok(ICONE[i], `sem ícone para ${i}`)
})
```

- [ ] **Step 2:** rodar → FAIL.

- [ ] **Step 3: Implementar**

`components/shell/icones-menu.ts`:

```ts
import {
  Home, Users, Wrench, LayoutGrid, Calendar, FileText, CreditCard, ListChecks, UserCheck,
  Building2, Table2, ArrowDownLeft, ArrowUpRight, SlidersHorizontal, Link2, Settings, Trash2, Construction,
  type LucideIcon,
} from 'lucide-react'
import type { IconeMenu } from '@/lib/navegacao'

export const ICONE: Record<IconeMenu, LucideIcon> = {
  inicio: Home,
  cadastro: Users,
  ferramentas: Wrench,
  dashboard: LayoutGrid,
  clientes: Users,
  calendario: Calendar,
  relatorios: FileText,
  parcelamentos: CreditCard,
  preenchimento: ListChecks,
  'minhas-tarefas': UserCheck,
  procedimentos: Building2,
  tabelas: Table2,
  recebimentos: ArrowDownLeft,
  pagamentos: ArrowUpRight,
  configuracoes: SlidersHorizontal,
  vinculos: Link2,
  parametros: Settings,
  lixeira: Trash2,
  'em-construcao': Construction,
}
```

(Se algum nome de ícone não existir na versão instalada do `lucide-react`, trocar por um equivalente que exista e citar no relatório; o teste "todo ícone do modelo tem desenho" garante que nenhum fica de fora.)

`components/shell/MenuLateral.tsx`:

```tsx
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { estaAtivo, type GrupoMenu } from '@/lib/navegacao'
import { ICONE } from './icones-menu'

export function MenuLateral({ grupos, pathname, toque = false, onNavegar, className }: {
  grupos: GrupoMenu[]
  pathname: string
  toque?: boolean
  onNavegar?: () => void
  className?: string
}) {
  return (
    <nav aria-label="Menu" className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5', className)}>
      {grupos.map(grupo => (
        <div
          key={grupo.id}
          className={cn('flex flex-col gap-0.5', grupo.id === 'admin' && 'mt-auto border-t border-line-soft pt-3')}
        >
          <p className="px-2.5 pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-[.06em] text-fg-3 first:pt-1">{grupo.titulo}</p>
          {grupo.itens.map(item => {
            const ativo = estaAtivo(pathname, item.href)
            const Icone = ICONE[item.icone]
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavegar}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-[11px] rounded-lg px-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  toque ? 'h-11' : 'h-[38px]',
                  ativo ? 'bg-acc-soft text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg',
                )}
              >
                <Icone size={18} strokeWidth={1.75} aria-hidden="true" className={ativo ? 'text-acc-text' : undefined} />
                {item.rotulo}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4:** focado passa (4); `npm test`; `npx tsc --noEmit` limpo. (Se `next/link` não renderizar fora do roteador no teste, parar e relatar NEEDS_CONTEXT com a saída — não trocar `Link` por `<a>`.)

- [ ] **Step 5: Commit**

```bash
git add components/shell/icones-menu.ts components/shell/MenuLateral.tsx tests/shell-menu.test.ts
git commit -m "feat(casca): menu lateral em três grupos com página atual marcada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Barra do topo, gaveta, barra inferior e a nova casca

**Files:**
- Create: `components/shell/BarraTopo.tsx`
- Create: `components/shell/GavetaMenu.tsx`
- Create: `components/shell/BarraInferior.tsx`
- Create: `components/shell/ShellCliente.tsx`
- Modify: `components/shell/PortalShell.tsx` (reescrever)
- Delete: `components/fiscal/TopNav.tsx`, `components/fiscal/Sidebar.tsx`, `components/fiscal/MesSeletor.tsx`
- Create: `tests/shell-casca.test.ts`

**Interfaces:**
- Consumes: `montarMenu`, `setoresVisiveis`, `atalhosCelular`, `estaAtivo`, `GrupoMenu`, `ItemMenu` (Task 2); `SeletorMes` (Task 3); `MenuLateral`, `ICONE` (Task 4); `Drawer` com `lado` (Task 1); `IconButton`, `Select`, `cn` (`components/ui`); `useTheme` (`lib/theme.ts`); `SETOR_LABEL`, `SETOR_HOME`, `Profile`, `UserSetor` (`lib/types.ts`); `SETOR_ATIVO_COOKIE` (`lib/setor-ativo.ts`); `MesAnoProvider` (`lib/mes-atual-context.tsx`); `createClient` (`lib/supabase/client`).
- Produces:
  - `BarraTopo(props: { profile: Profile; setores: UserSetor[]; setorAtivo: UserSetor; tema: 'dark' | 'light'; seletorMes: ReactNode; onTrocarSetor: (s: UserSetor) => void; onAlternarTema: () => void; onSair: () => void; onAbrirMenu: () => void })`
  - `GavetaMenu(props: { aberto: boolean; onFechar: () => void; profile: Profile; grupos: GrupoMenu[]; pathname: string; setores: UserSetor[]; setorAtivo: UserSetor; tema: 'dark' | 'light'; onTrocarSetor: (s: UserSetor) => void; onAlternarTema: () => void; onSair: () => void })` — inclui o botão de tema (no celular pequeno ele some da barra do topo).
  - `BarraInferior(props: { atalhos: ItemMenu[]; pathname: string; onMais: () => void })`
  - `ShellCliente(props: { profile: Profile; mes: number; ano: number; setorAtivo: UserSetor; grupos: GrupoMenu[]; setores: UserSetor[]; atalhos: ItemMenu[]; children: ReactNode })`
  - `PortalShell` mantém a mesma assinatura de hoje (`{ profile, mes, ano, setorAtivo, children }`) — os layouts não mudam.

- [ ] **Step 1: Teste que falha** — `tests/shell-casca.test.ts`:

```ts
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
```

- [ ] **Step 2:** rodar → FAIL.

- [ ] **Step 3: Implementar**

`components/shell/BarraTopo.tsx` (sem hooks; logo continua sendo `/logo.ico`):

```tsx
import Image from 'next/image'
import type { ReactNode } from 'react'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'

export function BarraTopo({ profile, setores, setorAtivo, tema, seletorMes, onTrocarSetor, onAlternarTema, onSair, onAbrirMenu }: {
  profile: Profile
  setores: UserSetor[]
  setorAtivo: UserSetor
  tema: 'dark' | 'light'
  seletorMes: ReactNode
  onTrocarSetor: (s: UserSetor) => void
  onAlternarTema: () => void
  onSair: () => void
  onAbrirMenu: () => void
}) {
  const nome = profile.nome ?? 'Usuário'
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line-soft bg-top px-2 print:hidden sm:gap-3 lg:px-4">
      <IconButton rotulo="Abrir menu" icone={<Menu size={22} aria-hidden="true" />} onClick={onAbrirMenu} className="h-11 w-11 lg:hidden" />
      <div className="flex shrink-0 items-center gap-2.5 font-bold tracking-[.01em] text-fg lg:w-[216px]">
        <Image src="/logo.ico" alt="" width={28} height={28} className="rounded-lg" />
        <span className="hidden sm:inline">Tesserato</span>
      </div>
      {setores.length > 1 && (
        <nav aria-label="Setores" className="hidden min-w-0 gap-1 overflow-x-auto lg:flex">
          {setores.map(s => {
            const atual = s === setorAtivo
            return (
              <button
                key={s}
                type="button"
                onClick={() => onTrocarSetor(s)}
                aria-current={atual ? 'page' : undefined}
                className={cn(
                  'inline-flex h-[34px] shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  atual ? 'bg-acc-soft text-fg shadow-[inset_0_-2px_0_var(--acc)]' : 'text-fg-2 hover:bg-raised hover:text-fg',
                )}
              >
                {SETOR_LABEL[s]}
              </button>
            )
          })}
        </nav>
      )}
      <div className="flex-1" />
      {seletorMes}
      <IconButton
        rotulo={tema === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
        icone={tema === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        onClick={onAlternarTema}
        className="hidden sm:inline-grid"
      />
      <div className="hidden items-center gap-2.5 border-l border-line-soft pl-3.5 lg:flex">
        <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: profile.cor }}>
          {nome.charAt(0).toUpperCase()}
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-fg">{nome}</p>
          <p className="text-xs text-fg-3">{profile.role === 'admin' ? 'Administrador' : 'Operador'}</p>
        </div>
        <IconButton rotulo="Sair" icone={<LogOut size={17} aria-hidden="true" />} onClick={onSair} />
      </div>
    </header>
  )
}
```

`components/shell/GavetaMenu.tsx`:

```tsx
'use client'

import { LogOut, Moon, Sun } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { SETOR_LABEL, type Profile, type UserSetor } from '@/lib/types'
import type { GrupoMenu } from '@/lib/navegacao'
import { MenuLateral } from './MenuLateral'

export function GavetaMenu({ aberto, onFechar, profile, grupos, pathname, setores, setorAtivo, tema, onTrocarSetor, onAlternarTema, onSair }: {
  aberto: boolean
  onFechar: () => void
  profile: Profile
  grupos: GrupoMenu[]
  pathname: string
  setores: UserSetor[]
  setorAtivo: UserSetor
  tema: 'dark' | 'light'
  onTrocarSetor: (s: UserSetor) => void
  onAlternarTema: () => void
  onSair: () => void
}) {
  const nome = profile.nome ?? 'Usuário'
  return (
    <Drawer
      aberto={aberto}
      onFechar={onFechar}
      titulo="Tesserato"
      lado="esquerda"
      larguraPx={316}
      rodape={
        <div className="flex w-full items-center gap-2.5">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: profile.cor }}>
            {nome.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold text-fg">{nome}</p>
            <p className="text-xs text-fg-3">{profile.role === 'admin' ? 'Administrador' : 'Operador'}</p>
          </div>
          <IconButton
            rotulo={tema === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
            icone={tema === 'light' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
            onClick={onAlternarTema}
            className="h-11 w-11"
          />
          <IconButton rotulo="Sair" icone={<LogOut size={20} aria-hidden="true" />} onClick={onSair} className="h-11 w-11" />
        </div>
      }
    >
      {setores.length > 1 && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-fg-2">
          Setor
          <Select aria-label="Setor" value={setorAtivo} onChange={e => onTrocarSetor(e.target.value as UserSetor)} className="h-11">
            {setores.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
          </Select>
        </label>
      )}
      <MenuLateral grupos={grupos} pathname={pathname} toque onNavegar={onFechar} className="-mx-3 px-0 py-0" />
    </Drawer>
  )
}
```

`components/shell/BarraInferior.tsx`:

```tsx
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { estaAtivo, type ItemMenu } from '@/lib/navegacao'
import { ICONE } from './icones-menu'

const ITEM = 'flex min-h-11 flex-col items-center justify-center gap-[3px] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc'

export function BarraInferior({ atalhos, pathname, onMais }: { atalhos: ItemMenu[]; pathname: string; onMais: () => void }) {
  return (
    <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-line-soft bg-top print:hidden lg:hidden">
      {atalhos.map(item => {
        const ativo = estaAtivo(pathname, item.href)
        const Icone = ICONE[item.icone]
        return (
          <Link key={item.href} href={item.href} aria-current={ativo ? 'page' : undefined} className={cn(ITEM, ativo ? 'text-acc-text' : 'text-fg-3')}>
            <Icone size={22} aria-hidden="true" />
            <span className="max-w-full truncate px-1">{item.rotulo}</span>
          </Link>
        )
      })}
      <button type="button" onClick={onMais} className={cn(ITEM, 'col-start-4 text-fg-3')}>
        <Menu size={22} aria-hidden="true" />
        Mais
      </button>
    </nav>
  )
}
```

`components/shell/ShellCliente.tsx`:

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/lib/theme'
import { SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { SETOR_ATIVO_COOKIE } from '@/lib/setor-ativo'
import type { GrupoMenu, ItemMenu } from '@/lib/navegacao'
import { BarraTopo } from './BarraTopo'
import { MenuLateral } from './MenuLateral'
import { GavetaMenu } from './GavetaMenu'
import { BarraInferior } from './BarraInferior'
import SeletorMes from './SeletorMes'

export function ShellCliente({ profile, mes, ano, setorAtivo, grupos, setores, atalhos, children }: {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  grupos: GrupoMenu[]
  setores: UserSetor[]
  atalhos: ItemMenu[]
  children: ReactNode
}) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [menuAberto, setMenuAberto] = useState(false)

  async function sair() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function trocarSetor(setor: UserSetor) {
    document.cookie = `${SETOR_ATIVO_COOKIE}=${setor}; path=/; max-age=${60 * 60 * 24 * 365}`
    setMenuAberto(false)
    router.push(SETOR_HOME[setor])
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page print:h-auto print:overflow-visible">
      <BarraTopo
        profile={profile}
        setores={setores}
        setorAtivo={setorAtivo}
        tema={theme}
        seletorMes={<SeletorMes mes={mes} ano={ano} />}
        onTrocarSetor={trocarSetor}
        onAlternarTema={toggleTheme}
        onSair={sair}
        onAbrirMenu={() => setMenuAberto(true)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden print:overflow-visible">
        <aside className="hidden w-[248px] shrink-0 border-r border-line-soft bg-nav print:hidden lg:flex lg:flex-col">
          <MenuLateral grupos={grupos} pathname={pathname} />
        </aside>
        <main id="conteudo" className="min-w-0 flex-1 overflow-y-auto pb-16 print:h-auto print:overflow-visible print:pb-0 lg:pb-0">
          {children}
        </main>
      </div>
      <GavetaMenu
        aberto={menuAberto}
        onFechar={() => setMenuAberto(false)}
        profile={profile}
        grupos={grupos}
        pathname={pathname}
        setores={setores}
        setorAtivo={setorAtivo}
        tema={theme}
        onTrocarSetor={trocarSetor}
        onAlternarTema={toggleTheme}
        onSair={sair}
      />
      <BarraInferior atalhos={atalhos} pathname={pathname} onMais={() => setMenuAberto(true)} />
    </div>
  )
}
```

`components/shell/PortalShell.tsx` (arquivo inteiro):

```tsx
// components/shell/PortalShell.tsx — casca de todas as telas (servidor).
// O menu é calculado aqui, no servidor, com as mesmas regras de permissão
// que o proxy usa; o ShellCliente só desenha.
import { MesAnoProvider } from '@/lib/mes-atual-context'
import { montarMenu, setoresVisiveis, atalhosCelular } from '@/lib/navegacao'
import type { Profile, UserSetor } from '@/lib/types'
import { ShellCliente } from './ShellCliente'

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  children: React.ReactNode
}

export default function PortalShell({ profile, mes, ano, setorAtivo, children }: Props) {
  const grupos = montarMenu(profile, setorAtivo)
  return (
    <MesAnoProvider mes={mes} ano={ano}>
      <ShellCliente
        profile={profile}
        mes={mes}
        ano={ano}
        setorAtivo={setorAtivo}
        grupos={grupos}
        setores={setoresVisiveis(profile)}
        atalhos={atalhosCelular(grupos)}
      >
        {children}
      </ShellCliente>
    </MesAnoProvider>
  )
}
```

Depois: `git rm components/fiscal/TopNav.tsx components/fiscal/Sidebar.tsx components/fiscal/MesSeletor.tsx`.

- [ ] **Step 4:** focado passa (7); `npm test`; `npx tsc --noEmit` limpo; `npx next build` ok (o build não precisa do `.env`).

- [ ] **Step 5: Commit**

```bash
git add components/shell tests/shell-casca.test.ts
git add -u components/fiscal
git commit -m "feat(casca): nova barra do topo, menu lateral, gaveta e barra inferior no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Carregando, erro, página não encontrada e viewport

**Files:**
- Create: `components/shell/CarregandoPagina.tsx`
- Create: `components/shell/ErroPagina.tsx`
- Create: `app/fiscal/loading.tsx`, `app/contabil/loading.tsx`, `app/pessoal/loading.tsx`, `app/societario/loading.tsx`, `app/financeiro/loading.tsx`, `app/admin/loading.tsx`, `app/(comum)/loading.tsx`
- Create: `app/fiscal/error.tsx`, `app/contabil/error.tsx`, `app/pessoal/error.tsx`, `app/societario/error.tsx`, `app/financeiro/error.tsx`, `app/admin/error.tsx`, `app/(comum)/error.tsx`
- Create: `app/not-found.tsx`
- Modify: `app/layout.tsx` (export `viewport`)
- Create: `tests/shell-estados.test.ts`

**Interfaces:**
- Consumes: `Button`, `EmptyState` (`components/ui`).
- Produces: `CarregandoPagina()` (esqueleto, `role="status"`, texto escondido "Carregando"); `ErroPagina({ error, reset })` (client); páginas `loading`/`error` de cada área reexportando essas peças; `app/not-found.tsx`.

> Antes de escrever o `error.tsx`, confira em `node_modules/next/dist/docs/` (procure por "error.js" / "error boundary") as props que o Next 16.2.9 passa ao componente de erro. O plano usa `{ error, reset }`; se a versão instalada usar outro nome (por exemplo `unstable_retry`), adapte o `ErroPagina` e cite no relatório.
> Atenção: `lib/get-portal-context.ts` explica que um `loading.tsx` torna a rota pré-carregável e que a checagem de página foi feita para tolerar isso. Não mexa nesse arquivo.

- [ ] **Step 1: Teste que falha** — `tests/shell-estados.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import CarregandoPagina from '../components/shell/CarregandoPagina'
import ErroPagina from '../components/shell/ErroPagina'
import NaoEncontrada from '../app/not-found'

const ROOT = join(__dirname, '..')
const AREAS = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro', 'admin', '(comum)']

test('cada área tem carregando e erro que reaproveitam as peças', () => {
  for (const a of AREAS) {
    const l = join(ROOT, 'app', a, 'loading.tsx')
    const e = join(ROOT, 'app', a, 'error.tsx')
    assert.ok(existsSync(l), `falta ${l}`)
    assert.ok(existsSync(e), `falta ${e}`)
    assert.match(readFileSync(l, 'utf8'), /CarregandoPagina/)
    const err = readFileSync(e, 'utf8')
    assert.match(err, /^'use client'/)
    assert.match(err, /ErroPagina/)
  }
})

test('carregando é anunciado e não é texto solto', () => {
  const html = renderToStaticMarkup(h(CarregandoPagina))
  assert.match(html, /role="status"/)
  assert.match(html, /Carregando/)
  assert.match(html, /animate-pulse/)
})

test('erro explica e oferece tentar de novo', () => {
  const html = renderToStaticMarkup(h(ErroPagina, { error: new Error('x'), reset: () => {} }))
  assert.match(html, /Não foi possível abrir esta página/)
  assert.match(html, />Tentar de novo</)
  assert.match(html, /href="\/intranet"/)
})

test('página não encontrada em português, com caminho de volta', () => {
  const html = renderToStaticMarkup(h(NaoEncontrada))
  assert.match(html, /Página não encontrada/)
  assert.match(html, /href="\/intranet"/)
})

test('layout raiz declara o viewport do celular', () => {
  const src = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
  assert.match(src, /export const viewport/)
  assert.match(src, /width:\s*["']device-width["']/)
  assert.match(src, /initialScale:\s*1/)
})
```

- [ ] **Step 2:** rodar → FAIL.

- [ ] **Step 3: Implementar**

`components/shell/CarregandoPagina.tsx`:

```tsx
// Esqueleto com o formato de uma tela (título, filtros, lista) enquanto ela carrega.
export default function CarregandoPagina() {
  return (
    <div role="status" className="flex flex-col gap-5 px-4 py-7 sm:px-8">
      <span className="sr-only">Carregando</span>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-5">
        <div className="h-7 w-56 rounded-lg bg-raised" />
        <div className="h-4 w-80 max-w-full rounded bg-raised" />
        <div className="flex gap-3">
          <div className="h-9 w-64 max-w-full rounded-lg bg-raised" />
          <div className="hidden h-9 w-40 rounded-lg bg-raised sm:block" />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-4">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 rounded-lg bg-raised" />)}
        </div>
      </div>
    </div>
  )
}
```

`components/shell/ErroPagina.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export default function ErroPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="px-4 py-10 sm:px-8">
      <EmptyState
        icone={<AlertTriangle size={24} />}
        titulo="Não foi possível abrir esta página"
        descricao="Tente de novo. Se continuar, avise o administrador do portal."
        acao={
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button variante="primario" onClick={reset}>Tentar de novo</Button>
            <Link href="/intranet" className="text-sm font-medium text-acc-text hover:underline">Voltar ao Início</Link>
          </div>
        }
      />
    </div>
  )
}
```

Cada `app/<área>/loading.tsx` (as 7 áreas, conteúdo idêntico):

```tsx
import CarregandoPagina from '@/components/shell/CarregandoPagina'

export default function Loading() {
  return <CarregandoPagina />
}
```

Cada `app/<área>/error.tsx` (as 7 áreas, conteúdo idêntico):

```tsx
'use client'

import ErroPagina from '@/components/shell/ErroPagina'

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroPagina error={error} reset={reset} />
}
```

`app/not-found.tsx`:

```tsx
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export default function NaoEncontrada() {
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4">
      <EmptyState
        icone={<SearchX size={24} />}
        titulo="Página não encontrada"
        descricao="O endereço pode ter mudado ou a página foi removida."
        acao={<Link href="/intranet" className="inline-flex h-9 items-center rounded-lg bg-acc px-3.5 text-sm font-semibold text-acc-ink">Ir para o Início</Link>}
      />
    </main>
  )
}
```

`app/layout.tsx`: trocar o import de tipos para `import type { Metadata, Viewport } from "next";` e acrescentar, logo depois do `metadata`:

```tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
```

- [ ] **Step 4:** focado passa (5); `npm test`; `npx tsc --noEmit` limpo; `npx next build` ok.

- [ ] **Step 5: Commit**

```bash
git add components/shell/CarregandoPagina.tsx components/shell/ErroPagina.tsx app/not-found.tsx app/layout.tsx tests/shell-estados.test.ts
git add "app/fiscal/loading.tsx" "app/contabil/loading.tsx" "app/pessoal/loading.tsx" "app/societario/loading.tsx" "app/financeiro/loading.tsx" "app/admin/loading.tsx" "app/(comum)/loading.tsx"
git add "app/fiscal/error.tsx" "app/contabil/error.tsx" "app/pessoal/error.tsx" "app/societario/error.tsx" "app/financeiro/error.tsx" "app/admin/error.tsx" "app/(comum)/error.tsx"
git commit -m "feat(casca): telas de carregando, erro e página não encontrada; viewport do celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Verificação final e PR

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (tabela de andamento)

- [ ] **Step 1:** `npm test` (# fail 0), `npx tsc --noEmit`, `npm run lint` (sem achado novo nos arquivos desta fase), `npx next build`.
- [ ] **Step 2 (controller):** conferência no navegador com o banco de dev (Runner do Termbaker + `browser_login` com a credencial `ADMIN`), **só se o `.env.development.local` puder estar no worktree** (copiar sem abrir; se a cópia for negada, não contornar — pedir ao usuário). Conferir em 1440 px e no celular (`browser_responsive` iphone-13): barra do topo, mês com setas, troca de setor, menu com página atual, tema claro, gaveta e barra inferior no celular; `/rota-que-nao-existe` mostra "Página não encontrada".
- [ ] **Step 3:** na tabela "Andamento" do plano geral, linha da Fase 2: `| 2 Casca | feat/redesign-fase2-casca | #<número> | PR aberta contra dev, aguardando teste do usuário |`.
- [ ] **Step 4:** push e PR contra `dev` (sem merge), descrevendo: o que muda (moldura nova em todas as telas; mês no topo; menu em três grupos e só com as páginas liberadas; celular com gaveta e barra inferior; telas de carregando, erro e não encontrada), o que não muda (banco, permissões no servidor, conteúdo das páginas) e o que testar (cada perfil: admin, operador de um setor, operador multi-setor; celular; tema claro; virada de mês e de ano).
