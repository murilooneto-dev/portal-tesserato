# Redesign — Fase 1: Base visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao portal as cores, a fonte e as peças de interface do Design System aprovado, sem mudar o layout das telas, para que as fases seguintes só montem telas com essas peças.

**Architecture:** As cores viram variáveis CSS em `app/globals.css` (tema escuro e claro). Os nomes antigos (`--bg-page`, `--fg`, `--accent`…) continuam valendo, apontando para os valores novos. As variáveis viram classes Tailwind v4 via `@theme inline` (`bg-surface`, `text-fg-2`, `text-acc-ink`…). As peças ficam em `components/ui/`, sem dependência de Supabase nem de `@/`, para poderem ser testadas com `renderToStaticMarkup` no runner de testes que o projeto já usa (`node --test` + `tsx`). A única mudança visível nas telas atuais é o texto do botão principal, que passa a ser escuro sobre o ciano.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2, Tailwind CSS v4 (`@tailwindcss/postcss`), `lucide-react`, `next/font/google`, testes `node --import tsx --test "tests/**/*.test.ts"`.

**Spec:** `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (plano geral, seções 2 e 4 › Fase 1) + Design System no artifact https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV (pranchetas `ds-01-cores` … `ds-07-acessibilidade`).

## Global Constraints

- Trabalhar no worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f1`, branch `feat/redesign-fase1-base-visual` (criada de `origin/dev` 627b455). PR **contra `dev`**, sem merge.
- **Nenhuma migration, nenhuma mudança de banco, nenhuma mudança de regra de negócio.**
- Cores exatas (tema escuro): `--page #111E3A`, `--surface #162444`, `--raised #1C2D54`, `--inset #0F1A33`, `--nav #0D1730`, `--top #0B1019`, `--fg #F2F6FC`, `--fg-2 #B9C6DD`, `--fg-3 #9AABCB`, `--ph #8293B5`, `--acc #00CCEB`, `--acc-ink #04202B`, `--acc-text #00CCEB`, `--ok #34D399`, `--warn #FBBF24`, `--danger #FF8F8F`, `--danger-solid #DC2626`, `--info #7DB4FF`.
- Cores exatas (tema claro): `--page #F4F6FB`, `--surface #FFFFFF`, `--raised #EEF1F7`, `--inset #F8FAFD`, `--fg #111E3A`, `--fg-2 #33415E`, `--fg-3 #4F5E7E`, `--ph #56658A`, `--acc #00A8C4`, `--acc-ink #04202B`, `--acc-text #006B80`, `--ok #047857`, `--warn #92400E`, `--danger #B91C1C`, `--danger-solid #B91C1C`, `--info #1D4ED8`.
- Fonte: IBM Plex Sans (texto) e IBM Plex Mono (CNPJ e números), pesos 400/500/600/700.
- Texto mínimo de **12 px** em tudo que for criado nesta fase.
- Botão principal: **texto `--acc-ink` (#04202B) sobre `--acc`**. Nunca texto claro sobre ciano.
- Nome de cliente: **uma linha só**; corta com reticências mantendo **no mínimo `15ch`** visíveis; nome completo no `title`.
- Toda janela fecha com **Esc** e com **clique no fundo**, exceto enquanto salva.
- As peças de `components/ui/` **não importam** `@/…`, Supabase nem nada de `lib/` (só `react`, `react-dom`, `lucide-react` e arquivos de `components/ui/`).
- Rótulos e textos de interface em português do Brasil, frase com só a primeira letra maiúscula.
- Não ler `.env*`. Servidor de dev pelo Runner do Termbaker.

## Review Focus

1. **Impressão**: os relatórios usam `@media print`; com as variáveis novas, a impressão precisa continuar com fundo branco e texto preto, inclusive nas peças novas que usam `--page`/`--surface`/`--fg`. Teste na Task 1.
2. **Tema claro**: o "remendo" de contraste das classes `text-[var(--fg)]/NN` precisa continuar existindo, porque as telas antigas ainda usam essas classes até as fases seguintes. Teste na Task 1.
3. **Percentual fora da faixa** na pílula de mês (`-5`, `120`, `NaN`, `null`): deve virar 0–100 ou "—", nunca mostrar "120%" em verde nem quebrar. Teste na Task 3.
4. **Nome de cliente vazio ou com `&`/acentos**: vazio mostra "Sem nome"; caracteres especiais aparecem certos no texto e no `title`. Teste na Task 3.
5. **Fechar janela enquanto salva**: Esc e clique no fundo não podem fechar uma janela com `bloqueado`/`carregando` ligado (perderia o retorno do salvar). Teste na Task 5.

---

## Task 0: Preparar o worktree

**Files:** nenhum arquivo de código.

- [ ] **Step 1: Instalar dependências**

Run (PowerShell, no worktree): `npm ci`
Expected: termina sem erro (`added N packages`).

- [ ] **Step 2: Rodar a suíte atual para ter a linha de base**

Run: `npm test`
Expected: todos os testes passam (`# fail 0`). Anote o número de testes (`# pass N`).

- [ ] **Step 3: Commitar o plano geral junto da fase**

```bash
git add docs/superpowers/plans/2026-10-01-redesign-implantacao.md docs/superpowers/plans/2026-10-01-redesign-fase1-base-visual.md
git commit -m "docs: plano de implantação do redesign e plano da Fase 1"
```

---

## Task 1: Variáveis de cor, aliases antigos e classes Tailwind

**Files:**
- Modify: `app/globals.css` (arquivo inteiro, 55 linhas hoje)
- Create: `tests/design-tokens.test.ts`

**Interfaces:**
- Produces: variáveis CSS `--page --surface --raised --inset --nav --top --line --line-soft --fg --fg-2 --fg-3 --ph --acc --acc-ink --acc-text --acc-soft --ok --ok-soft --warn --warn-soft --danger --danger-soft --danger-solid --info --info-soft --neutral-soft --shadow --scrim`, mais `--accent-ink`. Classes Tailwind: `bg-page bg-surface bg-raised bg-inset bg-nav bg-top border-line border-line-soft text-fg text-fg-2 text-fg-3 text-ph bg-acc text-acc-ink text-acc-text bg-acc-soft text-ok bg-ok-soft text-warn bg-warn-soft text-danger bg-danger-soft bg-danger-solid text-info bg-info-soft bg-neutral-soft`, `font-sans`/`font-mono` (Plex, ligadas na Task 2), `shadow-modal`.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/design-tokens.test.ts`:

```ts
// tests/design-tokens.test.ts
//
// Garante que as cores do Design System aprovado (artifact SdZ3EYdm8CbusrZnGzz7sV,
// prancheta ds-01-cores) estão em app/globals.css com os valores exatos, que os
// nomes antigos continuam existindo (as telas atuais usam) e que a impressão
// continua em branco e preto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8')

function bloco(seletor: string): string {
  const i = CSS.indexOf(seletor + ' {')
  assert.ok(i >= 0, `bloco "${seletor}" não encontrado em globals.css`)
  const fim = CSS.indexOf('}', i)
  return CSS.slice(i, fim)
}

function valor(blocoCss: string, nome: string): string | undefined {
  const m = blocoCss.match(new RegExp(`--${nome}:\\s*([^;]+);`))
  return m?.[1].trim()
}

const ESCURO: Record<string, string> = {
  page: '#111E3A', surface: '#162444', raised: '#1C2D54', inset: '#0F1A33', nav: '#0D1730', top: '#0B1019',
  fg: '#F2F6FC', 'fg-2': '#B9C6DD', 'fg-3': '#9AABCB', ph: '#8293B5',
  acc: '#00CCEB', 'acc-ink': '#04202B', 'acc-text': '#00CCEB',
  ok: '#34D399', warn: '#FBBF24', danger: '#FF8F8F', 'danger-solid': '#DC2626', info: '#7DB4FF',
}
const CLARO: Record<string, string> = {
  page: '#F4F6FB', surface: '#FFFFFF', raised: '#EEF1F7', inset: '#F8FAFD',
  fg: '#111E3A', 'fg-2': '#33415E', 'fg-3': '#4F5E7E', ph: '#56658A',
  acc: '#00A8C4', 'acc-ink': '#04202B', 'acc-text': '#006B80',
  ok: '#047857', warn: '#92400E', danger: '#B91C1C', 'danger-solid': '#B91C1C', info: '#1D4ED8',
}

test('tema escuro tem as cores do Design System', () => {
  const b = bloco(':root')
  for (const [nome, cor] of Object.entries(ESCURO)) assert.equal(valor(b, nome)?.toUpperCase(), cor, `--${nome}`)
})

test('tema claro tem as cores do Design System', () => {
  const b = bloco(':root.light')
  for (const [nome, cor] of Object.entries(CLARO)) assert.equal(valor(b, nome)?.toUpperCase(), cor, `--${nome}`)
})

test('nomes antigos continuam existindo nos dois temas', () => {
  for (const sel of [':root', ':root.light']) {
    const b = bloco(sel)
    for (const nome of ['bg-page', 'bg-surface', 'bg-surface-2', 'accent', 'accent-hover', 'accent-ink']) {
      assert.ok(valor(b, nome), `${sel} deveria definir --${nome}`)
    }
  }
})

test('as cores viram classes Tailwind via @theme inline', () => {
  const i = CSS.indexOf('@theme inline {')
  assert.ok(i >= 0, '@theme inline não encontrado')
  const b = CSS.slice(i, CSS.indexOf('}', i))
  for (const nome of ['page', 'surface', 'raised', 'inset', 'line', 'line-soft', 'fg', 'fg-2', 'fg-3', 'ph', 'acc', 'acc-ink', 'acc-text', 'acc-soft', 'ok', 'ok-soft', 'warn', 'warn-soft', 'danger', 'danger-soft', 'danger-solid', 'info', 'info-soft', 'neutral-soft']) {
    assert.match(b, new RegExp(`--color-${nome}:\\s*var\\(--${nome}\\);`), `--color-${nome}`)
  }
})

test('remendo de contraste do tema claro continua até as telas migrarem', () => {
  assert.match(CSS, /:root\.light \.text-\\\[var\\\(--fg\\\)\\\]\\\/40/)
})

test('impressão força fundo branco e texto preto também nas variáveis novas', () => {
  const i = CSS.indexOf('@media print')
  assert.ok(i >= 0)
  const b = CSS.slice(i)
  for (const nome of ['page', 'surface', 'raised', 'inset', 'bg-page', 'bg-surface']) assert.match(b, new RegExp(`--${nome}:\\s*#ffffff`, 'i'), `print --${nome}`)
  assert.match(b, /--fg:\s*#000000/i)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/design-tokens.test.ts`
Expected: FAIL (ex.: `--page` undefined, `@theme inline não encontrado`).

- [ ] **Step 3: Reescrever `app/globals.css`**

Substituir o arquivo inteiro por:

```css
@import "tailwindcss";

/* Design System do redesign (artifact SdZ3EYdm8CbusrZnGzz7sV, prancheta ds-01-cores).
   Os nomes antigos (--bg-page, --fg, --accent…) continuam valendo e apontam
   para os valores novos, porque as telas atuais usam esses nomes. */
:root {
  --page: #111E3A;
  --surface: #162444;
  --raised: #1C2D54;
  --inset: #0F1A33;
  --nav: #0D1730;
  --top: #0B1019;
  --line: rgba(255, 255, 255, .12);
  --line-soft: rgba(255, 255, 255, .07);
  --fg: #F2F6FC;
  --fg-2: #B9C6DD;
  --fg-3: #9AABCB;
  --ph: #8293B5;
  --acc: #00CCEB;
  --acc-ink: #04202B;
  --acc-text: #00CCEB;
  --acc-soft: rgba(0, 204, 235, .14);
  --ok: #34D399;
  --ok-soft: rgba(52, 211, 153, .16);
  --warn: #FBBF24;
  --warn-soft: rgba(251, 191, 36, .16);
  --danger: #FF8F8F;
  --danger-soft: rgba(255, 143, 143, .14);
  --danger-solid: #DC2626;
  --info: #7DB4FF;
  --info-soft: rgba(125, 180, 255, .16);
  --neutral-soft: rgba(185, 198, 221, .12);
  --shadow: 0 24px 64px rgba(0, 0, 0, .5);
  --scrim: rgba(4, 10, 24, .66);

  /* nomes antigos */
  --bg-page: var(--page);
  --bg-surface: var(--surface);
  --bg-surface-2: var(--top);
  --accent: var(--acc);
  --accent-hover: #00b3d4;
  --accent-ink: var(--acc-ink);
}

:root.light {
  --page: #F4F6FB;
  --surface: #FFFFFF;
  --raised: #EEF1F7;
  --inset: #F8FAFD;
  --nav: #FFFFFF;
  --top: #FFFFFF;
  --line: rgba(17, 30, 58, .14);
  --line-soft: rgba(17, 30, 58, .08);
  --fg: #111E3A;
  --fg-2: #33415E;
  --fg-3: #4F5E7E;
  --ph: #56658A;
  --acc: #00A8C4;
  --acc-ink: #04202B;
  --acc-text: #006B80;
  --acc-soft: rgba(0, 168, 196, .12);
  --ok: #047857;
  --ok-soft: rgba(16, 185, 129, .14);
  --warn: #92400E;
  --warn-soft: rgba(245, 158, 11, .16);
  --danger: #B91C1C;
  --danger-soft: rgba(239, 68, 68, .12);
  --danger-solid: #B91C1C;
  --info: #1D4ED8;
  --info-soft: rgba(59, 130, 246, .12);
  --neutral-soft: rgba(17, 30, 58, .07);
  --shadow: 0 24px 64px rgba(17, 30, 58, .18);
  --scrim: rgba(17, 30, 58, .4);

  /* nomes antigos */
  --bg-page: var(--page);
  --bg-surface: var(--surface);
  --bg-surface-2: var(--raised);
  --accent: var(--acc);
  --accent-hover: #008fac;
  --accent-ink: var(--acc-ink);
}

/* Classes Tailwind a partir das variáveis (bg-surface, text-fg-2, text-acc-ink…). */
@theme inline {
  --color-page: var(--page);
  --color-surface: var(--surface);
  --color-raised: var(--raised);
  --color-inset: var(--inset);
  --color-nav: var(--nav);
  --color-top: var(--top);
  --color-line: var(--line);
  --color-line-soft: var(--line-soft);
  --color-fg: var(--fg);
  --color-fg-2: var(--fg-2);
  --color-fg-3: var(--fg-3);
  --color-ph: var(--ph);
  --color-acc: var(--acc);
  --color-acc-ink: var(--acc-ink);
  --color-acc-text: var(--acc-text);
  --color-acc-soft: var(--acc-soft);
  --color-ok: var(--ok);
  --color-ok-soft: var(--ok-soft);
  --color-warn: var(--warn);
  --color-warn-soft: var(--warn-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-solid: var(--danger-solid);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-neutral-soft: var(--neutral-soft);
  --shadow-modal: var(--shadow);
  --font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
}

/* Textos secundários (text-[var(--fg)]/NN) foram calibrados para o modo escuro
   (branco sobre azul-marinho). No modo claro, --fg é escuro e a mesma opacidade
   fica lavada contra fundo claro — eleva o piso de contraste aqui.
   Sai na Fase 8, quando nenhuma tela usar mais essas classes. */
:root.light .text-\[var\(--fg\)\]\/15 { color: color-mix(in oklab, var(--fg) 55%, transparent); }
:root.light .text-\[var\(--fg\)\]\/20 { color: color-mix(in oklab, var(--fg) 58%, transparent); }
:root.light .text-\[var\(--fg\)\]\/25 { color: color-mix(in oklab, var(--fg) 60%, transparent); }
:root.light .text-\[var\(--fg\)\]\/30 { color: color-mix(in oklab, var(--fg) 63%, transparent); }
:root.light .text-\[var\(--fg\)\]\/35 { color: color-mix(in oklab, var(--fg) 66%, transparent); }
:root.light .text-\[var\(--fg\)\]\/40 { color: color-mix(in oklab, var(--fg) 68%, transparent); }
:root.light .text-\[var\(--fg\)\]\/45 { color: color-mix(in oklab, var(--fg) 70%, transparent); }
:root.light .text-\[var\(--fg\)\]\/50 { color: color-mix(in oklab, var(--fg) 72%, transparent); }
:root.light .text-\[var\(--fg\)\]\/60 { color: color-mix(in oklab, var(--fg) 76%, transparent); }
:root.light .text-\[var\(--fg\)\]\/70 { color: color-mix(in oklab, var(--fg) 80%, transparent); }
:root.light .text-\[var\(--fg\)\]\/80 { color: color-mix(in oklab, var(--fg) 85%, transparent); }

body {
  background: var(--bg-page);
  color: var(--fg);
  font-family: var(--font-sans);
}

@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }

  :root, :root.light {
    --page: #ffffff;
    --surface: #ffffff;
    --raised: #ffffff;
    --inset: #ffffff;
    --bg-page: #ffffff;
    --bg-surface: #ffffff;
    --fg: #000000;
  }

  body { background: #ffffff; }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --import tsx --test tests/design-tokens.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Conferir que o Tailwind aceita o arquivo**

Run: `npx next build` (pode demorar ~1–2 min)
Expected: build termina sem erro de CSS. (Se a fonte da Task 2 ainda não existir, `--font-plex-sans` só fica sem valor e o navegador cai no `system-ui`; isso é esperado até a Task 2.)

- [ ] **Step 6: Commit**

```bash
git add app/globals.css tests/design-tokens.test.ts
git commit -m "feat(ui): cores do Design System com nomes antigos mantidos e classes Tailwind"
```

---

## Task 2: Fonte IBM Plex

**Files:**
- Modify: `app/layout.tsx`
- Create: `tests/design-fonte.test.ts`

**Interfaces:**
- Consumes: `--font-sans`/`--font-mono` da Task 1 (que leem `--font-plex-sans`/`--font-plex-mono`).
- Produces: variáveis `--font-plex-sans` e `--font-plex-mono` no `<html>`.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/design-fonte.test.ts`:

```ts
// tests/design-fonte.test.ts — a fonte do Design System (IBM Plex) é carregada no layout raiz.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LAYOUT = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')

test('layout carrega IBM Plex Sans e Mono pelo next/font', () => {
  assert.match(LAYOUT, /from ["']next\/font\/google["']/)
  assert.match(LAYOUT, /IBM_Plex_Sans\(/)
  assert.match(LAYOUT, /IBM_Plex_Mono\(/)
  assert.match(LAYOUT, /variable:\s*["']--font-plex-sans["']/)
  assert.match(LAYOUT, /variable:\s*["']--font-plex-mono["']/)
})

test('as variáveis da fonte vão para o <html>', () => {
  assert.match(LAYOUT, /<html[^>]*className=\{`\$\{plexSans\.variable\} \$\{plexMono\.variable\}`\}/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/design-fonte.test.ts`
Expected: FAIL (`IBM_Plex_Sans` não encontrado).

- [ ] **Step 3: Implementar**

Em `app/layout.tsx`, adicionar o import e as duas constantes logo depois de `import "./globals.css";`:

```tsx
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
```

E trocar a linha do `<html>` por:

```tsx
    <html lang="pt-BR" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
```

(O script do tema continua igual: ele só adiciona `light` à `classList`, sem apagar as classes da fonte.)

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --import tsx --test tests/design-fonte.test.ts`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npx next build`
Expected: sem erro (o `next/font` baixa a fonte no build; precisa de internet).

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx tests/design-fonte.test.ts
git commit -m "feat(ui): fonte IBM Plex Sans e Mono no layout raiz"
```

---

## Task 3: Peças básicas — Button, IconButton, Badge, MonthPill, NomeCliente

**Files:**
- Create: `components/ui/cn.ts`
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/MonthPill.tsx`
- Create: `components/ui/NomeCliente.tsx`
- Create: `tests/ui-basicos.test.ts`

**Interfaces:**
- Produces:
  - `cn(...partes: (string | false | null | undefined)[]): string`
  - `Button(props: ButtonProps)` com `variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'perigo-solido'` (padrão `'secundario'`), `tamanho?: 'p' | 'm' | 'g'` (padrão `'m'`), `icone?: ReactNode`, `carregando?: boolean`, e os atributos de `<button>`; `type` padrão `"button"`.
  - `IconButton(props)` com `rotulo: string` (obrigatório, vira `aria-label` e `title`), `icone: ReactNode`, `borda?: boolean`, atributos de `<button>`.
  - `Badge(props)` com `tom?: 'ok' | 'warn' | 'dng' | 'info' | 'acc' | 'neu'` (padrão `'neu'`), `icone?: ReactNode`, `grande?: boolean`, `children`.
  - `tomDoPercentual(p: number | null | undefined): 'vazio' | 'zero' | 'parcial' | 'completo'` e `normalizarPercentual(p: number | null | undefined): number | null`.
  - `MonthPill(props)` com `percentual: number | null | undefined`, `atual?: boolean`, `rotulo?: string` (texto acessível; padrão `"<p>% concluído"`).
  - `NomeCliente(props)` com `nome: string`, `cnpj?: string | null` (se `undefined`, não mostra a linha do CNPJ; se `null` ou `''`, mostra "CNPJ não informado"), `depoisDoNome?: ReactNode` (P1, ícone de observação…), `abaixo?: ReactNode`.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/ui-basicos.test.ts`:

```ts
// tests/ui-basicos.test.ts — peças básicas do Design System (components/ui).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '../components/ui/cn'
import { Button, IconButton } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { MonthPill, tomDoPercentual, normalizarPercentual } from '../components/ui/MonthPill'
import { NomeCliente } from '../components/ui/NomeCliente'

test('cn junta só as partes verdadeiras', () => {
  assert.equal(cn('a', false, null, undefined, 'b'), 'a b')
})

test('botão principal usa texto escuro sobre o ciano', () => {
  const html = renderToStaticMarkup(h(Button, { variante: 'primario' }, 'Salvar'))
  assert.match(html, /bg-acc /)
  assert.match(html, /text-acc-ink/)
  assert.doesNotMatch(html, /text-white|text-fg /)
})

test('botão é type=button por padrão e fica desabilitado carregando', () => {
  const html = renderToStaticMarkup(h(Button, { carregando: true }, 'Salvar'))
  assert.match(html, /type="button"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /aria-busy="true"/)
})

test('botão de ícone sempre tem nome acessível', () => {
  const html = renderToStaticMarkup(h(IconButton, { rotulo: 'Fechar', icone: h('svg') }))
  assert.match(html, /aria-label="Fechar"/)
  assert.match(html, /title="Fechar"/)
})

test('selo usa a cor do tom', () => {
  assert.match(renderToStaticMarkup(h(Badge, { tom: 'dng' }, 'Saída')), /bg-danger-soft text-danger/)
  assert.match(renderToStaticMarkup(h(Badge, { tom: 'ok' }, 'Entrada')), /bg-ok-soft text-ok/)
  assert.match(renderToStaticMarkup(h(Badge, {}, 'x')), /bg-neutral-soft text-fg-2/)
})

test('tom da pílula de mês nas fronteiras', () => {
  assert.equal(tomDoPercentual(0), 'zero')
  assert.equal(tomDoPercentual(1), 'parcial')
  assert.equal(tomDoPercentual(99), 'parcial')
  assert.equal(tomDoPercentual(100), 'completo')
  assert.equal(tomDoPercentual(null), 'vazio')
  assert.equal(tomDoPercentual(undefined), 'vazio')
})

test('percentual fora da faixa é corrigido e NaN vira vazio', () => {
  assert.equal(normalizarPercentual(-5), 0)
  assert.equal(normalizarPercentual(120), 100)
  assert.equal(normalizarPercentual(64.6), 65)
  assert.equal(normalizarPercentual(Number.NaN), null)
  assert.equal(tomDoPercentual(120), 'completo')
  assert.equal(tomDoPercentual(Number.NaN), 'vazio')
})

test('pílula mostra o percentual, o texto acessível e o destaque do mês atual', () => {
  const html = renderToStaticMarkup(h(MonthPill, { percentual: 64, atual: true }))
  assert.match(html, />64%</)
  assert.match(html, /title="64% concluído"/)
  assert.match(html, /bg-warn-soft text-warn/)
  assert.match(html, /ring-2 ring-acc/)
  assert.match(renderToStaticMarkup(h(MonthPill, { percentual: null })), />—</)
})

test('nome do cliente: uma linha, mínimo de 15 caracteres e nome completo no title', () => {
  const nome = 'ANTONIA LUENIA MARTINS TEIXEIRA COMERCIO DE ALIMENTOS E BEBIDAS LTDA ME'
  const html = renderToStaticMarkup(h(NomeCliente, { nome, cnpj: '98.765.432/0001-10' }))
  assert.match(html, /class="[^"]*truncate[^"]*min-w-\[15ch\]/)
  assert.ok(html.includes(`title="${nome}"`))
  assert.match(html, /98\.765\.432\/0001-10/)
})

test('nome do cliente: CNPJ vazio, sem CNPJ, nome vazio e caracteres especiais', () => {
  assert.match(renderToStaticMarkup(h(NomeCliente, { nome: 'A', cnpj: null })), /CNPJ não informado/)
  assert.doesNotMatch(renderToStaticMarkup(h(NomeCliente, { nome: 'A' })), /CNPJ/)
  assert.match(renderToStaticMarkup(h(NomeCliente, { nome: '   ' })), />Sem nome</)
  const html = renderToStaticMarkup(h(NomeCliente, { nome: 'Ribeiro & Filhos Ação' }))
  assert.ok(html.includes('title="Ribeiro &amp; Filhos Ação"'))
  assert.ok(html.includes('>Ribeiro &amp; Filhos Ação<'))
})

test('nome do cliente aceita conteúdo logo depois do nome (P1, observação)', () => {
  const html = renderToStaticMarkup(h(NomeCliente, { nome: 'Cliente', depoisDoNome: h(Badge, { tom: 'dng' }, 'P1') }))
  assert.ok(html.indexOf('Cliente') < html.indexOf('P1'))
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/ui-basicos.test.ts`
Expected: FAIL (`Cannot find module '../components/ui/cn'`).

- [ ] **Step 3: Implementar**

Create `components/ui/cn.ts`:

```ts
// Junta classes CSS ignorando valores falsos.
export function cn(...partes: (string | false | null | undefined)[]): string {
  return partes.filter(Boolean).join(' ')
}
```

Create `components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'perigo-solido'
export type ButtonSize = 'p' | 'm' | 'g'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-page ' +
  'disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTE: Record<ButtonVariant, string> = {
  primario: 'bg-acc border-acc text-acc-ink font-semibold hover:brightness-95',
  secundario: 'bg-raised border-line text-fg hover:border-fg-3',
  fantasma: 'bg-transparent border-transparent text-fg-2 hover:bg-raised hover:text-fg',
  perigo: 'bg-transparent border-danger/45 text-danger hover:bg-danger-soft',
  'perigo-solido': 'bg-danger-solid border-danger-solid text-white font-semibold hover:brightness-95',
}

const TAMANHO: Record<ButtonSize, string> = {
  p: 'h-[30px] px-2.5 text-[13px] rounded-[7px]',
  m: 'h-9 px-3.5 text-sm rounded-lg',
  g: 'h-11 px-[18px] text-[15px] rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariant
  tamanho?: ButtonSize
  icone?: ReactNode
  carregando?: boolean
}

export function Button({
  variante = 'secundario',
  tamanho = 'm',
  icone,
  carregando = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(BASE, VARIANTE[variante], TAMANHO[tamanho], className)}
      {...rest}
    >
      {icone}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  rotulo: string
  icone: ReactNode
  borda?: boolean
}

export function IconButton({ rotulo, icone, borda = false, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'inline-grid h-[34px] w-[34px] flex-none place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-45',
        borda ? 'border border-line' : 'border border-transparent',
        className,
      )}
      {...rest}
    >
      {icone}
    </button>
  )
}
```

Create `components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTom = 'ok' | 'warn' | 'dng' | 'info' | 'acc' | 'neu'

const TOM: Record<BadgeTom, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  dng: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  acc: 'bg-acc-soft text-acc-text',
  neu: 'bg-neutral-soft text-fg-2',
}

export function Badge({ tom = 'neu', icone, grande = false, className, children }: {
  tom?: BadgeTom
  icone?: ReactNode
  grande?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-md font-semibold leading-none',
        grande ? 'h-[26px] px-2.5 text-[13px]' : 'h-[22px] px-2 text-xs',
        TOM[tom],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  )
}
```

Create `components/ui/MonthPill.tsx`:

```tsx
import { cn } from './cn'

export type TomPercentual = 'vazio' | 'zero' | 'parcial' | 'completo'

// Corrige dado fora da faixa (0–100) e descarta NaN.
export function normalizarPercentual(p: number | null | undefined): number | null {
  if (p === null || p === undefined || Number.isNaN(p)) return null
  return Math.min(100, Math.max(0, Math.round(p)))
}

export function tomDoPercentual(p: number | null | undefined): TomPercentual {
  const n = normalizarPercentual(p)
  if (n === null) return 'vazio'
  if (n >= 100) return 'completo'
  if (n <= 0) return 'zero'
  return 'parcial'
}

const COR: Record<TomPercentual, string> = {
  vazio: 'text-fg-3 font-medium',
  zero: 'bg-danger-soft text-danger',
  parcial: 'bg-warn-soft text-warn',
  completo: 'bg-ok-soft text-ok',
}

export function MonthPill({ percentual, atual = false, rotulo, className }: {
  percentual: number | null | undefined
  atual?: boolean
  rotulo?: string
  className?: string
}) {
  const n = normalizarPercentual(percentual)
  const texto = n === null ? '—' : `${n}%`
  return (
    <span
      title={rotulo ?? (n === null ? 'Sem tarefas no mês' : `${n}% concluído`)}
      className={cn(
        'inline-flex h-[26px] min-w-10 items-center justify-center rounded-[7px] px-1 text-xs font-bold tabular-nums',
        COR[tomDoPercentual(percentual)],
        atual && 'ring-2 ring-acc',
        className,
      )}
    >
      {texto}
    </span>
  )
}
```

Create `components/ui/NomeCliente.tsx`:

```tsx
import type { ReactNode } from 'react'

// Regra do redesign: o nome do cliente nunca quebra linha. Se não couber,
// corta com reticências mantendo pelo menos 15 caracteres visíveis, e o nome
// completo aparece ao passar o mouse.
export function NomeCliente({ nome, cnpj, depoisDoNome, abaixo }: {
  nome: string
  cnpj?: string | null
  depoisDoNome?: ReactNode
  abaixo?: ReactNode
}) {
  const texto = nome.trim() || 'Sem nome'
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 leading-tight">
        <span className="truncate min-w-[15ch] font-semibold text-fg" title={texto}>{texto}</span>
        {depoisDoNome}
      </div>
      {cnpj !== undefined && (
        <div className="mt-0.5 truncate font-mono text-[13px] text-fg-3">{cnpj || 'CNPJ não informado'}</div>
      )}
      {abaixo}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/ui-basicos.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add components/ui/cn.ts components/ui/Button.tsx components/ui/Badge.tsx components/ui/MonthPill.tsx components/ui/NomeCliente.tsx tests/ui-basicos.test.ts
git commit -m "feat(ui): botão, botão de ícone, selo, pílula de mês e nome do cliente"
```

---

## Task 4: Campos de formulário — Field, Input, Select, Textarea, Checkbox, Switch

**Files:**
- Create: `components/ui/Field.tsx`
- Create: `components/ui/Input.tsx`
- Create: `tests/ui-formulario.test.ts`

**Interfaces:**
- Consumes: `cn` (Task 3).
- Produces:
  - `Field(props)` — `rotulo: ReactNode`, `ajuda?: ReactNode`, `erro?: string | null`, `obrigatorio?: boolean`, `className?: string`, `children: (c: CampoIds) => ReactNode`, onde `CampoIds = { id: string; describedBy?: string; invalido: boolean }`. Liga o `<label htmlFor>` ao campo; erro com `role="alert"`.
  - `Input(props)` — atributos de `<input>` + `invalido?: boolean`, `iconeEsquerda?: ReactNode`.
  - `Select(props)` — atributos de `<select>` + `invalido?: boolean`, `children` (`<option>`s).
  - `Textarea(props)` — atributos de `<textarea>` + `invalido?: boolean`.
  - `Checkbox(props)` — atributos de `<input type=checkbox>` + `rotulo: ReactNode`.
  - `Switch(props)` — `ligado: boolean`, `onMudar: (ligado: boolean) => void`, `rotulo: ReactNode`, `disabled?: boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/ui-formulario.test.ts`:

```ts
// tests/ui-formulario.test.ts — campos do Design System com rótulo ligado e erro acessível.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Field } from '../components/ui/Field'
import { Input, Select, Textarea, Checkbox, Switch } from '../components/ui/Input'

test('rótulo fica ligado ao campo pelo id', () => {
  const html = renderToStaticMarkup(
    h(Field, { rotulo: 'Razão social', children: (c: { id: string }) => h(Input, { id: c.id }) }),
  )
  const idLabel = html.match(/<label[^>]*for="([^"]+)"/)?.[1]
  const idInput = html.match(/<input[^>]*id="([^"]+)"/)?.[1]
  assert.ok(idLabel)
  assert.equal(idLabel, idInput)
})

test('erro aparece com role=alert e o campo aponta para ele', () => {
  const html = renderToStaticMarkup(
    h(Field, {
      rotulo: 'CNPJ',
      erro: 'CNPJ incompleto',
      children: (c: { id: string; describedBy?: string; invalido: boolean }) =>
        h(Input, { id: c.id, 'aria-describedby': c.describedBy, invalido: c.invalido }),
    }),
  )
  assert.match(html, /role="alert"[^>]*>CNPJ incompleto</)
  const idErro = html.match(/id="([^"]+)"[^>]*role="alert"|role="alert"[^>]*id="([^"]+)"/)
  assert.ok(idErro)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /aria-describedby="[^"]*-erro/)
})

test('campo obrigatório mostra o asterisco escondido do leitor de tela', () => {
  const html = renderToStaticMarkup(
    h(Field, { rotulo: 'Nome', obrigatorio: true, children: (c: { id: string }) => h(Input, { id: c.id }) }),
  )
  assert.match(html, /aria-hidden="true"[^>]*>\*</)
})

test('input usa as cores do Design System e placeholder legível', () => {
  const html = renderToStaticMarkup(h(Input, { placeholder: 'dd/mm/aaaa' }))
  assert.match(html, /bg-inset/)
  assert.match(html, /placeholder:text-ph/)
})

test('select e textarea marcam inválido', () => {
  assert.match(renderToStaticMarkup(h(Select, { invalido: true }, h('option', null, 'Todos'))), /aria-invalid="true"/)
  assert.match(renderToStaticMarkup(h(Textarea, { invalido: true })), /aria-invalid="true"/)
})

test('checkbox tem rótulo clicável', () => {
  const html = renderToStaticMarkup(h(Checkbox, { rotulo: 'Sem movimento', defaultChecked: true }))
  assert.match(html, /<label[^>]*>.*type="checkbox".*Sem movimento.*<\/label>/s)
})

test('switch expõe o estado para leitor de tela', () => {
  const html = renderToStaticMarkup(h(Switch, { ligado: true, onMudar: () => {}, rotulo: 'Mostrar desabilitados' }))
  assert.match(html, /role="switch"/)
  assert.match(html, /aria-checked="true"/)
  assert.match(html, /Mostrar desabilitados/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/ui-formulario.test.ts`
Expected: FAIL (`Cannot find module '../components/ui/Field'`).

- [ ] **Step 3: Implementar**

Create `components/ui/Field.tsx`:

```tsx
'use client'

import { useId, type ReactNode } from 'react'
import { cn } from './cn'

export interface CampoIds {
  id: string
  describedBy?: string
  invalido: boolean
}

export function Field({ rotulo, ajuda, erro, obrigatorio = false, className, children }: {
  rotulo: ReactNode
  ajuda?: ReactNode
  erro?: string | null
  obrigatorio?: boolean
  className?: string
  children: (c: CampoIds) => ReactNode
}) {
  const id = useId()
  const idAjuda = ajuda ? `${id}-ajuda` : undefined
  const idErro = erro ? `${id}-erro` : undefined
  const describedBy = [idErro, idAjuda].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-fg-2">
        {rotulo}
        {obrigatorio && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </label>
      {children({ id, describedBy, invalido: Boolean(erro) })}
      {erro && <p id={idErro} role="alert" className="text-xs text-danger">{erro}</p>}
      {ajuda && !erro && <p id={idAjuda} className="text-xs text-fg-3">{ajuda}</p>}
    </div>
  )
}
```

Create `components/ui/Input.tsx`:

```tsx
'use client'

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

const CAMPO =
  'w-full rounded-lg border border-line bg-inset px-3 text-sm text-fg placeholder:text-ph ' +
  'focus:border-acc focus:outline-none focus:ring-[3px] focus:ring-acc-soft disabled:cursor-not-allowed disabled:opacity-60'
const INVALIDO = 'border-danger ring-[3px] ring-danger-soft'

export function Input({ invalido = false, iconeEsquerda, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & {
  invalido?: boolean
  iconeEsquerda?: ReactNode
}) {
  const input = (
    <input
      aria-invalid={invalido || undefined}
      className={cn(CAMPO, 'h-9', iconeEsquerda ? 'pl-9' : undefined, invalido && INVALIDO, className)}
      {...rest}
    />
  )
  if (!iconeEsquerda) return input
  return (
    <div className="relative min-w-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true">{iconeEsquerda}</span>
      {input}
    </div>
  )
}

export function Select({ invalido = false, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & {
  invalido?: boolean
}) {
  return (
    <div className="relative min-w-0">
      <select
        aria-invalid={invalido || undefined}
        className={cn(CAMPO, 'h-9 appearance-none pr-9', invalido && INVALIDO, className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  )
}

export function Textarea({ invalido = false, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalido?: boolean
}) {
  return (
    <textarea
      aria-invalid={invalido || undefined}
      className={cn(CAMPO, 'min-h-[88px] py-2 leading-relaxed', invalido && INVALIDO, className)}
      {...rest}
    />
  )
}

export function Checkbox({ rotulo, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  rotulo: ReactNode
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-fg-2', className)}>
      <input type="checkbox" className="h-[18px] w-[18px] flex-none cursor-pointer accent-[var(--acc)]" {...rest} />
      <span>{rotulo}</span>
    </label>
  )
}

export function Switch({ ligado, onMudar, rotulo, disabled = false }: {
  ligado: boolean
  onMudar: (ligado: boolean) => void
  rotulo: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onMudar(!ligado)}
      className="inline-flex items-center gap-2.5 text-sm text-fg-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 flex-none rounded-full border transition-colors',
          ligado ? 'border-acc bg-acc' : 'border-line bg-raised',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all',
            ligado ? 'left-[18px] bg-acc-ink' : 'left-[2px] bg-fg-3',
          )}
        />
      </span>
      {rotulo}
    </button>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/ui-formulario.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Field.tsx components/ui/Input.tsx tests/ui-formulario.test.ts
git commit -m "feat(ui): campos de formulário com rótulo ligado, erro acessível, checkbox e switch"
```

---

## Task 5: Janelas — Modal, Drawer, ConfirmDialog e confirmação no lugar do `confirm()`

**Files:**
- Create: `components/ui/overlay.ts`
- Create: `components/ui/Modal.tsx`
- Create: `components/ui/ConfirmDialog.tsx`
- Create: `tests/ui-janelas.test.ts`

**Interfaces:**
- Consumes: `cn`, `Button`, `IconButton` (Task 3).
- Produces:
  - `podeFechar(motivo: 'esc' | 'fundo' | 'botao', o: { bloqueado: boolean; fecharAoClicarFora: boolean }): boolean`
  - `proximoIndiceDeFoco(total: number, atual: number, paraTras: boolean): number` (volta ao início/fim em círculo; `total === 0` → `-1`).
  - `Modal(props)` — `aberto: boolean`, `onFechar: () => void`, `titulo: ReactNode`, `subtitulo?: ReactNode`, `icone?: ReactNode`, `largura?: 'p' | 'm' | 'g'` (520 / 640 / 780 px; padrão `'m'`), `rodape?: ReactNode`, `fecharAoClicarFora?: boolean` (padrão `true`), `bloqueado?: boolean` (padrão `false`; impede fechar enquanto salva), `children`.
  - `Drawer(props)` — mesmas props do `Modal` exceto `largura`, mais `larguraPx?: number` (padrão 520). Painel preso à direita, altura toda.
  - `ConfirmDialog(props)` — `aberto: boolean`, `titulo: ReactNode`, `descricao?: ReactNode`, `textoConfirmar?: string` (padrão `"Confirmar"`), `textoCancelar?: string` (padrão `"Cancelar"`), `perigo?: boolean`, `carregando?: boolean`, `onConfirmar: () => void`, `onCancelar: () => void`.
  - `ConfirmProvider({ children })` e `useConfirmar(): (opcoes: OpcoesConfirmacao) => Promise<boolean>`, onde `OpcoesConfirmacao = { titulo: string; descricao?: string; textoConfirmar?: string; perigo?: boolean }`. Substitui `window.confirm()` nas fases seguintes.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/ui-janelas.test.ts`:

```ts
// tests/ui-janelas.test.ts — janelas fecham com Esc e clique no fundo, nunca enquanto salvam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { podeFechar, proximoIndiceDeFoco } from '../components/ui/overlay'
import { Modal, Drawer } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

const livre = { bloqueado: false, fecharAoClicarFora: true }

test('Esc, fundo e botão fecham quando livre', () => {
  assert.equal(podeFechar('esc', livre), true)
  assert.equal(podeFechar('fundo', livre), true)
  assert.equal(podeFechar('botao', livre), true)
})

test('nada fecha enquanto a janela está salvando', () => {
  const salvando = { bloqueado: true, fecharAoClicarFora: true }
  assert.equal(podeFechar('esc', salvando), false)
  assert.equal(podeFechar('fundo', salvando), false)
  assert.equal(podeFechar('botao', salvando), false)
})

test('clique no fundo pode ser desligado sem desligar o Esc', () => {
  const o = { bloqueado: false, fecharAoClicarFora: false }
  assert.equal(podeFechar('fundo', o), false)
  assert.equal(podeFechar('esc', o), true)
})

test('foco circula dentro da janela com Tab e Shift+Tab', () => {
  assert.equal(proximoIndiceDeFoco(3, 2, false), 0)
  assert.equal(proximoIndiceDeFoco(3, 0, true), 2)
  assert.equal(proximoIndiceDeFoco(3, 1, false), 2)
  assert.equal(proximoIndiceDeFoco(0, 0, false), -1)
})

test('janela fechada não renderiza nada', () => {
  assert.equal(renderToStaticMarkup(h(Modal, { aberto: false, onFechar: () => {}, titulo: 'X' }, 'corpo')), '')
})

test('janela aberta é um diálogo acessível com título, corpo, rodapé e botão de fechar', () => {
  const html = renderToStaticMarkup(
    h(Modal, { aberto: true, onFechar: () => {}, titulo: 'Editar empresa', subtitulo: 'Cliente Fiscal Via Geral', rodape: 'RODAPE' }, 'CORPO'),
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  const idTitulo = html.match(/aria-labelledby="([^"]+)"/)?.[1]
  assert.ok(idTitulo && html.includes(`id="${idTitulo}"`))
  assert.match(html, /Editar empresa/)
  assert.match(html, /CORPO/)
  assert.match(html, /RODAPE/)
  assert.match(html, /aria-label="Fechar \(Esc\)"/)
  assert.match(html, /max-w-\[640px\]/)
})

test('gaveta é um diálogo preso à direita', () => {
  const html = renderToStaticMarkup(h(Drawer, { aberto: true, onFechar: () => {}, titulo: 'Editar usuário' }, 'x'))
  assert.match(html, /role="dialog"/)
  assert.match(html, /right-0/)
})

test('confirmação de perigo usa botão vermelho sólido e mostra o efeito', () => {
  const html = renderToStaticMarkup(
    h(ConfirmDialog, {
      aberto: true,
      titulo: 'Excluir cliente?',
      descricao: 'Vai para a Lixeira por 60 dias.',
      textoConfirmar: 'Excluir',
      perigo: true,
      onConfirmar: () => {},
      onCancelar: () => {},
    }),
  )
  assert.match(html, /Excluir cliente\?/)
  assert.match(html, /Lixeira por 60 dias/)
  assert.match(html, /bg-danger-solid[^"]*"[^>]*>Excluir</)
  assert.match(html, />Cancelar</)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/ui-janelas.test.ts`
Expected: FAIL (`Cannot find module '../components/ui/overlay'`).

- [ ] **Step 3: Implementar**

Create `components/ui/overlay.ts`:

```ts
// Regras puras das janelas (testáveis sem navegador).

export type MotivoFechar = 'esc' | 'fundo' | 'botao'

export function podeFechar(motivo: MotivoFechar, o: { bloqueado: boolean; fecharAoClicarFora: boolean }): boolean {
  if (o.bloqueado) return false
  if (motivo === 'fundo') return o.fecharAoClicarFora
  return true
}

export function proximoIndiceDeFoco(total: number, atual: number, paraTras: boolean): number {
  if (total <= 0) return -1
  if (paraTras) return atual <= 0 ? total - 1 : atual - 1
  return atual >= total - 1 ? 0 : atual + 1
}

export const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
```

Create `components/ui/Modal.tsx`:

```tsx
'use client'

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'
import { podeFechar, proximoIndiceDeFoco, SELETOR_FOCAVEL, type MotivoFechar } from './overlay'

interface BaseProps {
  aberto: boolean
  onFechar: () => void
  titulo: ReactNode
  subtitulo?: ReactNode
  icone?: ReactNode
  rodape?: ReactNode
  fecharAoClicarFora?: boolean
  bloqueado?: boolean
  children?: ReactNode
}

// Comportamento comum: Esc, foco preso dentro, foco volta ao elemento de
// origem ao fechar e rolagem da página travada enquanto aberta.
// `tentarFechar` muda a cada render; fica num ref para o efeito rodar só ao
// abrir/fechar (senão o foco pularia para o primeiro campo a cada tecla).
function useJanela(aberto: boolean, painel: RefObject<HTMLDivElement | null>, tentarFechar: (m: MotivoFechar) => void) {
  const fecharRef = useRef(tentarFechar)
  fecharRef.current = tentarFechar
  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focaveis = () => Array.from(painel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL) ?? [])
    focaveis()[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); fecharRef.current('esc'); return }
      if (e.key !== 'Tab') return
      const itens = focaveis()
      if (itens.length === 0) { e.preventDefault(); return }
      const atual = itens.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      itens[proximoIndiceDeFoco(itens.length, atual, e.shiftKey)]?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowAnterior
      anterior?.focus?.()
    }
  }, [aberto, painel])
}

function Cabecalho({ idTitulo, idSub, titulo, subtitulo, icone, onFechar, bloqueado }: {
  idTitulo: string; idSub: string; titulo: ReactNode; subtitulo?: ReactNode; icone?: ReactNode; onFechar: () => void; bloqueado: boolean
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line-soft px-[22px] py-[18px]">
      {icone}
      <div className="min-w-0 flex-1">
        <h2 id={idTitulo} className="text-[17px] font-semibold text-fg">{titulo}</h2>
        {subtitulo && <p id={idSub} className="mt-0.5 text-[13px] text-fg-3">{subtitulo}</p>}
      </div>
      <IconButton rotulo="Fechar (Esc)" icone={<X size={18} aria-hidden="true" />} onClick={onFechar} disabled={bloqueado} />
    </div>
  )
}

const LARGURA = { p: 'max-w-[520px]', m: 'max-w-[640px]', g: 'max-w-[780px]' } as const

export function Modal({
  aberto, onFechar, titulo, subtitulo, icone, rodape, children,
  largura = 'm', fecharAoClicarFora = true, bloqueado = false,
}: BaseProps & { largura?: keyof typeof LARGURA }) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idSub = useId()
  const tentarFechar = (m: MotivoFechar) => { if (podeFechar(m, { bloqueado, fecharAoClicarFora })) onFechar() }
  useJanela(aberto, painel, tentarFechar)
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-4 sm:p-10"
      onMouseDown={e => { if (e.target === e.currentTarget) tentarFechar('fundo') }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={subtitulo ? idSub : undefined}
        className={cn('flex w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-modal', LARGURA[largura])}
      >
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} />
        <div className="flex flex-col gap-5 px-[22px] py-5">{children}</div>
        {rodape && <div className="flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5">{rodape}</div>}
      </div>
    </div>
  )
}

export function Drawer({
  aberto, onFechar, titulo, subtitulo, icone, rodape, children,
  larguraPx = 520, fecharAoClicarFora = true, bloqueado = false,
}: BaseProps & { larguraPx?: number }) {
  const painel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idSub = useId()
  const tentarFechar = (m: MotivoFechar) => { if (podeFechar(m, { bloqueado, fecharAoClicarFora })) onFechar() }
  useJanela(aberto, painel, tentarFechar)
  if (!aberto) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--scrim)]"
      onMouseDown={e => { if (e.target === e.currentTarget) tentarFechar('fundo') }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={subtitulo ? idSub : undefined}
        style={{ width: `min(${larguraPx}px, 100vw)` }}
        className="absolute right-0 top-0 flex h-full flex-col border-l border-line bg-surface shadow-modal"
      >
        <Cabecalho idTitulo={idTitulo} idSub={idSub} titulo={titulo} subtitulo={subtitulo} icone={icone} onFechar={() => tentarFechar('botao')} bloqueado={bloqueado} />
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5">{children}</div>
        {rodape && <div className="flex items-center gap-2.5 border-t border-line-soft px-[22px] py-3.5">{rodape}</div>}
      </div>
    </div>
  )
}
```

Create `components/ui/ConfirmDialog.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export function ConfirmDialog({
  aberto, titulo, descricao, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar',
  perigo = false, carregando = false, onConfirmar, onCancelar,
}: {
  aberto: boolean
  titulo: ReactNode
  descricao?: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  perigo?: boolean
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <Modal
      aberto={aberto}
      onFechar={onCancelar}
      titulo={titulo}
      largura="p"
      bloqueado={carregando}
      icone={perigo ? (
        <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-danger-soft text-danger" aria-hidden="true">
          <AlertTriangle size={18} />
        </span>
      ) : undefined}
      rodape={
        <div className="ml-auto flex gap-2.5">
          <Button variante="fantasma" onClick={onCancelar} disabled={carregando}>{textoCancelar}</Button>
          <Button variante={perigo ? 'perigo-solido' : 'primario'} onClick={onConfirmar} carregando={carregando}>{textoConfirmar}</Button>
        </div>
      }
    >
      {descricao && <div className="text-sm leading-relaxed text-fg-2">{descricao}</div>}
    </Modal>
  )
}

export interface OpcoesConfirmacao {
  titulo: string
  descricao?: string
  textoConfirmar?: string
  perigo?: boolean
}

type Confirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>

const ConfirmContext = createContext<Confirmar | null>(null)

// Troca o window.confirm(): const confirmar = useConfirmar(); if (await confirmar({...})) {...}
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmacao | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirmar = useCallback<Confirmar>(o => new Promise<boolean>(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setOpcoes(o)
  }), [])

  function responder(v: boolean) {
    resolver.current?.(v)
    resolver.current = null
    setOpcoes(null)
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <ConfirmDialog
        aberto={opcoes !== null}
        titulo={opcoes?.titulo ?? ''}
        descricao={opcoes?.descricao}
        textoConfirmar={opcoes?.textoConfirmar}
        perigo={opcoes?.perigo}
        onConfirmar={() => responder(true)}
        onCancelar={() => responder(false)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirmar(): Confirmar {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmar precisa estar dentro de <ConfirmProvider> (montado em app/layout.tsx)')
  return ctx
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/ui-janelas.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add components/ui/overlay.ts components/ui/Modal.tsx components/ui/ConfirmDialog.tsx tests/ui-janelas.test.ts
git commit -m "feat(ui): janela, gaveta e confirmação com Esc, clique no fundo e foco preso"
```

---

## Task 6: Avisos, cartão, tabela, estado vazio e aviso de "salvo"; providers no layout

**Files:**
- Create: `components/ui/Card.tsx`
- Create: `components/ui/Aviso.tsx`
- Create: `components/ui/EmptyState.tsx`
- Create: `components/ui/Tabela.tsx`
- Create: `components/ui/Toast.tsx`
- Create: `components/ui/Providers.tsx`
- Create: `components/ui/index.ts`
- Modify: `app/layout.tsx` (envolver `{children}` com `<Providers>`)
- Create: `tests/ui-feedback.test.ts`

**Interfaces:**
- Consumes: `cn`, `ConfirmProvider` (Task 5).
- Produces:
  - `Card(props)` — `titulo?: ReactNode`, `meta?: ReactNode` (selo ao lado do título), `acoes?: ReactNode` (à direita), `semPadding?: boolean`, `className?: string`, `children`.
  - `Aviso(props)` — `tom: 'info' | 'warn' | 'dng' | 'ok'`, `children`, `icone?: ReactNode` (padrão por tom: Info, AlertTriangle, AlertCircle, CheckCircle2).
  - `EmptyState(props)` — `icone: ReactNode`, `titulo: ReactNode`, `descricao?: ReactNode`, `acao?: ReactNode`.
  - `Tabela`, `Th`, `Td` — `Th`/`Td` aceitam `alinhar?: 'esq' | 'centro' | 'dir'` e `largura?: number` (só `Th`), e os atributos de `<th>`/`<td>`.
  - `filaDeAvisos(fila: AvisoSalvo[], acao: { tipo: 'adicionar'; aviso: AvisoSalvo } | { tipo: 'remover'; id: number }): AvisoSalvo[]` (mantém no máximo 3, os mais novos), com `AvisoSalvo = { id: number; texto: string; tom: 'ok' | 'dng' | 'info' }`.
  - `ToastProvider({ children })` e `useToast(): (texto: string, tom?: 'ok' | 'dng' | 'info') => void` (some sozinho em 4 s; região `aria-live="polite"`).
  - `Providers({ children })` — `ToastProvider` + `ConfirmProvider`.
  - `components/ui/index.ts` — reexporta tudo de `components/ui/`.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/ui-feedback.test.ts`:

```ts
// tests/ui-feedback.test.ts — avisos, cartão, tabela, vazio e fila de "salvo".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Card } from '../components/ui/Card'
import { Aviso } from '../components/ui/Aviso'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabela, Th, Td } from '../components/ui/Tabela'
import { filaDeAvisos, type AvisoSalvo } from '../components/ui/Toast'
import * as ui from '../components/ui'

test('cartão com título, selo e ações', () => {
  const html = renderToStaticMarkup(h(Card, { titulo: 'Tarefas de setembro', meta: 'META', acoes: 'ACOES' }, 'CORPO'))
  assert.match(html, /<h2[^>]*>Tarefas de setembro<\/h2>/)
  assert.ok(html.indexOf('META') < html.indexOf('ACOES'))
  assert.match(html, /bg-surface/)
})

test('aviso usa a cor do tom e tem ícone escondido do leitor', () => {
  const html = renderToStaticMarkup(h(Aviso, { tom: 'warn' }, 'Este cliente possui parcelamento'))
  assert.match(html, /bg-warn-soft/)
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /Este cliente possui parcelamento/)
})

test('estado vazio explica e oferece ação', () => {
  const html = renderToStaticMarkup(h(EmptyState, { icone: h('svg'), titulo: 'Nenhum evento', descricao: 'Registre aqui', acao: h('button', null, 'Novo evento') }))
  assert.match(html, /Nenhum evento/)
  assert.match(html, /Registre aqui/)
  assert.match(html, /Novo evento/)
})

test('tabela com cabeçalho e alinhamento', () => {
  const html = renderToStaticMarkup(
    h(Tabela, null,
      h('thead', null, h('tr', null, h(Th, { largura: 120 }, 'Valor'))),
      h('tbody', null, h('tr', null, h(Td, { alinhar: 'dir' }, 'R$ 250,00')))),
  )
  assert.match(html, /<table/)
  assert.match(html, /style="width:120px"/)
  assert.match(html, /text-right/)
})

test('fila de avisos guarda no máximo 3, os mais novos', () => {
  let fila: AvisoSalvo[] = []
  for (let i = 1; i <= 4; i++) fila = filaDeAvisos(fila, { tipo: 'adicionar', aviso: { id: i, texto: `a${i}`, tom: 'ok' } })
  assert.deepEqual(fila.map(a => a.id), [2, 3, 4])
  fila = filaDeAvisos(fila, { tipo: 'remover', id: 3 })
  assert.deepEqual(fila.map(a => a.id), [2, 4])
})

test('index reexporta as peças', () => {
  for (const nome of ['Button', 'IconButton', 'Badge', 'MonthPill', 'NomeCliente', 'Field', 'Input', 'Select', 'Textarea', 'Checkbox', 'Switch', 'Modal', 'Drawer', 'ConfirmDialog', 'useConfirmar', 'Card', 'Aviso', 'EmptyState', 'Tabela', 'Th', 'Td', 'useToast', 'Providers']) {
    assert.ok((ui as Record<string, unknown>)[nome], `components/ui não exporta ${nome}`)
  }
})

test('layout raiz monta os providers de confirmação e aviso', () => {
  const layout = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')
  assert.match(layout, /<Providers>\s*\{children\}\s*<\/Providers>/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/ui-feedback.test.ts`
Expected: FAIL (`Cannot find module '../components/ui/Card'`).

- [ ] **Step 3: Implementar**

Create `components/ui/Card.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Card({ titulo, meta, acoes, semPadding = false, className, children }: {
  titulo?: ReactNode
  meta?: ReactNode
  acoes?: ReactNode
  semPadding?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-line-soft bg-surface', className)}>
      {(titulo || acoes) && (
        <div className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
          {titulo && <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>}
          {meta}
          {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
        </div>
      )}
      {semPadding ? children : <div className="px-[18px] py-4">{children}</div>}
    </section>
  )
}
```

Create `components/ui/Aviso.tsx`:

```tsx
import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from './cn'

export type AvisoTom = 'info' | 'warn' | 'dng' | 'ok'

const FUNDO: Record<AvisoTom, string> = { info: 'bg-info-soft', warn: 'bg-warn-soft', dng: 'bg-danger-soft', ok: 'bg-ok-soft' }
const COR_ICONE: Record<AvisoTom, string> = { info: 'text-info', warn: 'text-warn', dng: 'text-danger', ok: 'text-ok' }
const ICONE: Record<AvisoTom, typeof Info> = { info: Info, warn: AlertTriangle, dng: AlertCircle, ok: CheckCircle2 }

export function Aviso({ tom, icone, className, children }: {
  tom: AvisoTom
  icone?: ReactNode
  className?: string
  children: ReactNode
}) {
  const Icone = ICONE[tom]
  return (
    <div className={cn('flex items-start gap-3 rounded-[10px] px-4 py-3 text-[13px] leading-relaxed text-fg-2 [&_b]:font-semibold [&_b]:text-fg', FUNDO[tom], className)}>
      <span aria-hidden="true" className={cn('mt-0.5 flex-none', COR_ICONE[tom])}>{icone ?? <Icone size={18} />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
```

Create `components/ui/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'

export function EmptyState({ icone, titulo, descricao, acao }: {
  icone: ReactNode
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-acc-soft text-acc-text">{icone}</span>
      <p className="text-[15px] font-semibold text-fg">{titulo}</p>
      {descricao && <p className="max-w-[420px] text-sm text-fg-3">{descricao}</p>}
      {acao && <div className="mt-1.5">{acao}</div>}
    </div>
  )
}
```

Create `components/ui/Tabela.tsx`:

```tsx
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from './cn'

type Alinhar = 'esq' | 'centro' | 'dir'
const ALINHAR: Record<Alinhar, string> = { esq: 'text-left', centro: 'text-center', dir: 'text-right' }

export function Tabela({ className, children }: { className?: string; children: ReactNode }) {
  return <table className={cn('w-full table-fixed border-collapse text-sm', className)}>{children}</table>
}

export function Th({ alinhar = 'esq', largura, className, style, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & {
  alinhar?: Alinhar
  largura?: number
}) {
  return (
    <th
      style={largura ? { width: `${largura}px`, ...style } : style}
      className={cn(
        'whitespace-nowrap border-b border-line-soft bg-[color-mix(in_srgb,var(--fg)_2%,transparent)] px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[.04em] text-fg-3',
        ALINHAR[alinhar],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ alinhar = 'esq', className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { alinhar?: Alinhar }) {
  return (
    <td className={cn('border-b border-line-soft px-3.5 py-3 align-middle', ALINHAR[alinhar], className)} {...rest}>
      {children}
    </td>
  )
}
```

Create `components/ui/Toast.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useReducer, useRef, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from './cn'

export interface AvisoSalvo { id: number; texto: string; tom: 'ok' | 'dng' | 'info' }
type Acao = { tipo: 'adicionar'; aviso: AvisoSalvo } | { tipo: 'remover'; id: number }

const MAXIMO = 3

export function filaDeAvisos(fila: AvisoSalvo[], acao: Acao): AvisoSalvo[] {
  if (acao.tipo === 'remover') return fila.filter(a => a.id !== acao.id)
  return [...fila, acao.aviso].slice(-MAXIMO)
}

type Mostrar = (texto: string, tom?: AvisoSalvo['tom']) => void
const ToastContext = createContext<Mostrar | null>(null)

const ICONE = { ok: CheckCircle2, dng: AlertCircle, info: Info }
const COR = { ok: 'text-ok', dng: 'text-danger', info: 'text-info' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [fila, despachar] = useReducer(filaDeAvisos, [])
  const proximoId = useRef(1)

  const mostrar = useCallback<Mostrar>((texto, tom = 'ok') => {
    const id = proximoId.current++
    despachar({ tipo: 'adicionar', aviso: { id, texto, tom } })
    setTimeout(() => despachar({ tipo: 'remover', id }), 4000)
  }, [])

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {fila.map(a => {
          const Icone = ICONE[a.tom]
          return (
            <div key={a.id} className="pointer-events-auto flex items-center gap-2.5 rounded-[10px] border border-line bg-raised px-4 py-3 text-sm text-fg shadow-modal">
              <Icone size={18} aria-hidden="true" className={cn('flex-none', COR[a.tom])} />
              {a.texto}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Mostrar {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider> (montado em app/layout.tsx)')
  return ctx
}
```

Create `components/ui/Providers.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from './Toast'
import { ConfirmProvider } from './ConfirmDialog'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  )
}
```

Create `components/ui/index.ts`:

```ts
export { cn } from './cn'
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize, type IconButtonProps } from './Button'
export { Badge, type BadgeTom } from './Badge'
export { MonthPill, tomDoPercentual, normalizarPercentual, type TomPercentual } from './MonthPill'
export { NomeCliente } from './NomeCliente'
export { Field, type CampoIds } from './Field'
export { Input, Select, Textarea, Checkbox, Switch } from './Input'
export { Modal, Drawer } from './Modal'
export { ConfirmDialog, ConfirmProvider, useConfirmar, type OpcoesConfirmacao } from './ConfirmDialog'
export { Card } from './Card'
export { Aviso, type AvisoTom } from './Aviso'
export { EmptyState } from './EmptyState'
export { Tabela, Th, Td } from './Tabela'
export { ToastProvider, useToast, filaDeAvisos, type AvisoSalvo } from './Toast'
export { Providers } from './Providers'
```

Em `app/layout.tsx`, importar e envolver:

```tsx
import { Providers } from "@/components/ui/Providers";
```

```tsx
      <body>
        <Providers>{children}</Providers>
      </body>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/ui-feedback.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Suíte inteira e tipos**

Run: `npm test` e depois `npx tsc --noEmit`
Expected: tudo passa; número de testes = linha de base da Task 0 + os novos.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Card.tsx components/ui/Aviso.tsx components/ui/EmptyState.tsx components/ui/Tabela.tsx components/ui/Toast.tsx components/ui/Providers.tsx components/ui/index.ts app/layout.tsx tests/ui-feedback.test.ts
git commit -m "feat(ui): cartão, aviso, estado vazio, tabela e aviso de salvo; providers no layout"
```

---

## Task 7: Contraste do botão principal nas telas atuais

Hoje 52 botões usam `bg-[var(--accent)]` com `text-[var(--fg)]` (texto claro sobre ciano, 1,94:1). No tema claro `--fg` já é escuro, mas no escuro não. A correção é trocar só a cor do texto desses botões por `text-[var(--accent-ink)]`.

**Files:**
- Modify: os arquivos listados pelo comando do Step 1 (52 ocorrências em `app/` e `components/`).
- Create: `tests/contraste-botao-principal.test.ts`

**Interfaces:**
- Consumes: `--accent-ink` (Task 1).

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/contraste-botao-principal.test.ts`:

```ts
// tests/contraste-botao-principal.test.ts
//
// Texto claro sobre o ciano (bg-[var(--accent)] + text-[var(--fg)]) tem contraste
// 1,94:1 no tema escuro. O botão principal usa --accent-ink (#04202B).
// Este teste falha se algum className voltar a juntar os dois.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return arquivos(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

test('nenhum botão com fundo ciano usa texto claro', () => {
  const ruins: string[] = []
  for (const f of [...arquivos(join(ROOT, 'app')), ...arquivos(join(ROOT, 'components'))]) {
    const linhas = readFileSync(f, 'utf8').split('\n')
    linhas.forEach((l, i) => {
      if (/bg-\[var\(--accent\)\](?![\/\w-])/.test(l) && /text-\[var\(--fg\)\](?![\/\w-])/.test(l)) {
        ruins.push(`${f.replace(ROOT, '')}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(ruins, [], `texto claro sobre ciano em:\n${ruins.join('\n')}`)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/contraste-botao-principal.test.ts`
Expected: FAIL, listando ~52 linhas.

- [ ] **Step 3: Trocar a cor do texto nessas linhas**

Rodar este script uma vez (PowerShell ou bash com `node`) — ele só troca `text-[var(--fg)]` (exato, sem `/NN`) por `text-[var(--accent-ink)]` **nas linhas que também têm `bg-[var(--accent)]` sem opacidade**:

```bash
node -e "
const fs=require('fs'),path=require('path');
function walk(d){return fs.readdirSync(d).flatMap(n=>{const p=path.join(d,n);return fs.statSync(p).isDirectory()?walk(p):p.endsWith('.tsx')?[p]:[]})}
let total=0;
for(const f of [...walk('app'),...walk('components')]){
  const s=fs.readFileSync(f,'utf8');
  const out=s.split('\n').map(l=>{
    if(/bg-\[var\(--accent\)\](?![\/\w-])/.test(l)&&/text-\[var\(--fg\)\](?![\/\w-])/.test(l)){total++;return l.replace(/text-\[var\(--fg\)\](?![\/\w-])/g,'text-[var(--accent-ink)]')}
    return l});
  const novo=out.join('\n'); if(novo!==s) fs.writeFileSync(f,novo);
}
console.log('linhas trocadas:',total);
"
```

Expected: `linhas trocadas: 52` (ou o número que o Step 2 listou).

- [ ] **Step 4: Conferir o diff à mão**

Run: `git diff --stat` e `git diff | grep "^[-+]" | grep -v "^+++\|^---" | head -40`
Expected: só trocas `text-[var(--fg)]` → `text-[var(--accent-ink)]`, em linhas com `bg-[var(--accent)]`. Nenhuma outra mudança.

- [ ] **Step 5: Rodar o teste, a suíte e os tipos**

Run: `node --import tsx --test tests/contraste-botao-principal.test.ts`, `npm test`, `npx tsc --noEmit`
Expected: tudo passa.

- [ ] **Step 6: Commit**

```bash
git add -A app components tests/contraste-botao-principal.test.ts
git commit -m "fix(ui): texto escuro nos botões com fundo ciano (contraste 1,94:1 → 8,7:1)"
```

---

## Task 8: Verificação final, documentação e PR

**Files:**
- Create: `components/ui/README.md`
- Modify: `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (tabela de andamento)

- [ ] **Step 1: Documentar as peças**

Create `components/ui/README.md`:

```markdown
# components/ui — peças do Design System

Base do redesign (artifact https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV). Use estas peças nas telas novas e ao migrar telas antigas, em vez de montar botão, campo ou janela à mão.

| Peça | Quando usar |
|---|---|
| `Button` | Toda ação. **No máximo um `variante="primario"` por tela.** `perigo-solido` só dentro de confirmação de exclusão. |
| `IconButton` | Ação só com ícone; `rotulo` é obrigatório (leitor de tela e dica). |
| `Badge` | Situação e categoria: `ok` verde, `warn` âmbar, `dng` vermelho, `info` azul, `acc` ciano, `neu` cinza. |
| `MonthPill` | Percentual de tarefas do mês (0% vermelho, 1–99% âmbar, 100% verde; `atual` = contorno ciano). |
| `NomeCliente` | Nome do cliente em listas: uma linha, reticências, mínimo de 15 caracteres, nome inteiro no `title`. |
| `Field` + `Input`/`Select`/`Textarea` | Todo campo com rótulo ligado, ajuda e erro. |
| `Checkbox`, `Switch` | Marcar item / ligar e desligar opção. |
| `Modal`, `Drawer` | Janelas. Fecham com Esc e clique no fundo; `bloqueado` enquanto salva. |
| `useConfirmar()` | **No lugar de `window.confirm()`**: `if (await confirmar({ titulo, descricao, perigo: true })) …` |
| `useToast()` | Aviso de "salvo" ou de erro depois de uma ação. |
| `Card`, `Aviso`, `EmptyState`, `Tabela`/`Th`/`Td` | Estrutura das telas. |

Classes de cor disponíveis (Tailwind): `bg-page bg-surface bg-raised bg-inset`, `text-fg text-fg-2 text-fg-3`, `border-line border-line-soft`, `bg-acc text-acc-ink text-acc-text bg-acc-soft`, `text-ok/warn/danger/info` e `bg-*-soft`. Texto mínimo de 12 px.
```

- [ ] **Step 2: Verificação completa**

Run, em sequência:
- `npm test` → `# fail 0`
- `npx tsc --noEmit` → sem erros
- `npm run lint` → sem erros novos nos arquivos desta fase (`components/ui/**`, `tests/ui-*.test.ts`, `tests/design-*.test.ts`, `tests/contraste-botao-principal.test.ts`, `app/globals.css`, `app/layout.tsx`)
- `npx next build` → build ok

- [ ] **Step 3: Conferência visual rápida no banco de dev**

1. Copiar o arquivo de ambiente de dev do diretório principal para o worktree (sem abrir o arquivo): `Copy-Item "..\.env.development.local" ".\.env.development.local"`.
2. Subir o dev server pelo Runner do Termbaker: `runner_start({ command: "npm run dev -- -p 3110", cwd: "wt-redesign-f1", name: "redesign fase 1" })`; conferir com `runner_logs` que subiu.
3. `browser_open("http://localhost:3110/login")`, entrar com a credencial `ADMIN` do cofre (`browser_login`).
4. Abrir `/fiscal/clientes`, `/contabil/clientes` e `/fiscal/parametros`; `browser_screenshot` de cada. Conferir: fonte IBM Plex aplicada, botões ciano com texto escuro, nada quebrado. Alternar o tema claro pelo botão do topo e repetir uma tela.
5. Parar o servidor (`runner_stop`) e apagar a cópia do `.env.development.local` do worktree.

- [ ] **Step 4: Atualizar o andamento no plano geral**

Em `docs/superpowers/plans/2026-10-01-redesign-implantacao.md`, na tabela "Andamento", trocar a linha da Fase 1 por:

```markdown
| 1 Base visual | feat/redesign-fase1-base-visual | (número da PR) | PR aberta contra dev, aguardando teste do usuário |
```

- [ ] **Step 5: Commit, push e PR**

```bash
git add components/ui/README.md docs/superpowers/plans/2026-10-01-redesign-implantacao.md
git commit -m "docs(ui): guia das peças do Design System e andamento da Fase 1"
git push -u origin feat/redesign-fase1-base-visual
gh pr create --base dev --title "Redesign Fase 1: base visual (cores, fonte IBM Plex e peças comuns)" --body-file - <<'EOF'
## O que muda
- Cores do Design System aprovado em `app/globals.css`, temas escuro e claro. Os nomes antigos (`--bg-page`, `--fg`, `--accent`…) continuam valendo, apontando para os valores novos.
- Fonte IBM Plex Sans e Mono no sistema todo.
- Botões com fundo ciano passam a ter **texto escuro** (contraste de 1,94:1 para 8,7:1). É a única mudança visível nas telas atuais.
- Peças novas em `components/ui/` (botão, selo, pílula de mês, nome do cliente em uma linha, campos com rótulo, janela e gaveta com Esc e clique fora, confirmação no lugar do `confirm()`, aviso de "salvo", cartão, tabela, estado vazio). As telas passam a usar essas peças nas fases 2 a 8.

## O que não muda
- Nenhuma migration, nenhuma mudança de banco, nenhuma regra de negócio.
- Layout das telas igual ao de hoje.

## Para testar
- Navegar pelas telas nos dois temas: tudo deve estar igual, com a fonte nova e botões ciano com texto escuro.
- Imprimir um relatório: continua branco e preto.

Plano: `docs/superpowers/plans/2026-10-01-redesign-fase1-base-visual.md` · Design: https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: link da PR. **Não fazer merge.** Atualizar a tabela de andamento com o número real da PR num commit seguinte, se ainda estiver "(número da PR)".
