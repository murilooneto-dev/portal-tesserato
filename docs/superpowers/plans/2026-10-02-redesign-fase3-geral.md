# Redesign — Fase 3: Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar para o desenho aprovado as telas do grupo Geral — Login, Redefinir senha, Início (agenda + comunicado + links), `/fiscal/agenda`, Cadastro de clientes (lista e janela), Ferramentas e Vínculos de tarefas — sem mudar o que cada tela faz, a não ser os ajustes listados em "Muda de funcionamento".

**Architecture:** Regras saem dos componentes para funções puras testáveis (`lib/agenda.ts`, `lib/links-uteis.ts`, `lib/clientes-geral.ts`, `lib/senha.ts`, `resumoNovosVinculos` em `lib/vinculos.ts`). As telas passam a usar as peças de `components/ui/` (Fase 1) mais três peças novas (`Pagina`/`CabecalhoPagina`, `Segmentado`, `Chip`). A agenda vira um componente só (`components/geral/agenda/`), usado no Início e em `/fiscal/agenda`. Janelas passam para `Modal` (Esc, clique fora, foco preso, pilha); as que abrem por cima da janela de cliente migram junto para não ficarem escondidas atrás dela.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19.2, Tailwind v4 (classes do Design System), `lucide-react`, `tailwind-merge`, Supabase JS, testes `node --import tsx --test "tests/**/*.test.ts"` com `renderToStaticMarkup`.

**Spec:** `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (Fase 3 + seção 2) e pranchetas `g-01`…`g-07`, `m-02`, `m-03`, `m-04`, `m-05`, `m-11`, `m-19`, `mob-01`, `mob-02` (cópia local: `D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\<nome>.html`; gerador em `...\boards\03_comum.js`, `09_modais.js`, `11_mobile.js`).

## Global Constraints

- Worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f3`, branch `feat/redesign-fase3-geral`, criada **em cima de `feat/redesign-fase2-casca`** (PR #193 ainda aberta; a casca é pré-requisito). PR **contra `dev`**, sem merge.
- **Nenhuma migration, nenhuma mudança de banco**, nenhuma mudança em Server Actions além do que está escrito aqui (nenhuma está prevista).
- Não ler `.env*`. Servidor de dev só pelo Runner do Termbaker.
- Texto mínimo 12 px (`text-xs`); nada de `text-[9px]`, `text-[10px]`, `text-[11px]`.
- Cores só pelas classes do Design System (`bg-surface`, `text-fg-2`, `border-line-soft`, `bg-acc`, `text-acc-text`, `bg-warn-soft`…). Nada de `[var(--fg)]/40`, `amber-500`, `red-400`, `#hex` fixo (exceção: o índigo `#8B93F8` do cartão SIGA em Ferramentas, decisão do usuário).
- **No máximo um botão `variante="primario"` por tela.**
- Nome de cliente em lista sempre com `NomeCliente` (1 linha, reticências, mínimo 15ch, `title`).
- Nada de `window.confirm()`/`alert()`: usar `useConfirmar()`. Aviso de sucesso com `useToast()`.
- Janelas com `Modal` de `components/ui/Modal`. Botões com `Button`/`IconButton`. Campos com `Field` + `Input`/`Select`/`Textarea`/`Checkbox`/`Switch`.
- Rótulos em português com só a primeira letra maiúscula ("Novo cliente", "Vínculos de tarefas").
- Texto que os testes procuram inteiro (ex.: `Minha agenda · Setembro 2026`, `1 cliente`) vai numa template string: `{a} {b}` vira vários nós de texto separados por `<!-- -->` no `renderToStaticMarkup`.
- Celular (< 640 px): sem rolagem horizontal da página (tabelas largas rolam dentro do próprio cartão); alvos de toque de pelo menos 44 px nas telas de acesso.
- `npx tsc --noEmit` limpo (tsconfig ES2017: sem flag `/s` em regex); `npx eslint` limpo nos arquivos tocados.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Muda de funcionamento (destacar na PR)

1. Agenda: Início e `/fiscal/agenda` passam a ser a **mesma** agenda. Lembretes = compromissos **pendentes** de hoje até daqui a 3 dias (regra do Início; a página `/fiscal/agenda` usava a marcação "lembrete"). Cor âmbar no calendário = pendente **com** "Avisar 3 dias antes" dentro da janela (concluído deixa de ficar âmbar).
2. Agenda: "Novo compromisso" já vem com a data de hoje (ou do dia aberto); excluir pede confirmação na janela nova; erro ao salvar aparece (antes falhava calado).
3. Links úteis: "Concluir edição" **salva todas** as alterações de uma vez (antes cada cartão tinha seu Salvar e o resto era descartado); endereço é validado; link sem `https://` passa a abrir certo.
4. Cadastro de clientes: filtro novo por **Setor**; busca ignora acentos e pontuação do CNPJ; coluna Endereço sai da tela (fica na impressão como Município); coluna Setores nova; selo "Desabilitado" ao lado do nome.
5. Janela do cliente: opção "Configurações" sai da lista de setores do cliente (não é setor de cliente).
6. Vínculos: excluir vínculo pede confirmação; setor "Configurações" sai das listas.

## Review Focus

1. **Mês que começa no domingo e mês de 6 semanas** (fevereiro/2026 começa no domingo e tem 28 dias; agosto/2026 começa no sábado e precisa de 42 casas): a grade tem que alinhar o dia 1 na coluna certa e fechar múltiplo de 7. Teste na Task 3.
2. **Bordas da janela de 3 dias dos lembretes** (hoje entra, daqui a 3 dias entra, daqui a 4 não, ontem não, virada de ano conta certo, horário sem segundos/sem hora): Task 3.
3. **Busca do cadastro com CNPJ digitado com ou sem pontuação, e nome com acento** ("12.345" e "12345" acham `12.345.678/0001-90`; "sao" acha "São Paulo"): Task 6.
4. **Vários links editados e um inválido**: nada é salvo, o erro aparece só no cartão errado e as outras edições continuam na tela: lógica em `validarLink`/`linksAlterados`, Task 5.
5. **Janela dentro de janela**: confirmação de exclusão, desabilitar e "Novo tipo de tarefa" abrem **por cima** da janela de cliente (todas no `Modal`, sem `fixed inset-0` próprio): teste de fonte na Task 7.

## Rulings (pré-execução)

- R1: Agenda unificada segue a regra de lembretes do Início (ver "Muda de funcionamento" 1). Custo se errado: quem usava `/fiscal/agenda` vê mais lembretes.
- R2: Desabilitar cliente **continua pedindo nome + senha** (a senha é conferida no servidor por `desabilitarClienteGeral`). A prancheta m-04 propõe tirar a senha, mas isso muda a Server Action — perguntar ao usuário no fim, não decidir sozinho.
- R3: "Concluir edição" dos links é `secundario` (o primário da tela é "Novo compromisso").
- R4: `CamposFiscais` e `GruposTarefasModal` ficam como estão (Fase 4). Só `NovoTipoTarefaModal` migra agora, porque abre por cima da janela de cliente.
- R5: No celular, a tabela do Cadastro rola dentro do cartão (não há prancheta de celular para essa tela).
- R6: Branch empilhada na Fase 2; a PR contra `dev` mostra os commits da #193 até ela ser mergeada.

---

## Task 0: Preparar o worktree

**Files:** nenhum arquivo de código.

- [ ] **Step 1:** `npm ci` → termina sem erro.
- [ ] **Step 2:** `npm test` → anotar a linha de base (`ℹ pass N`, `ℹ fail 0`; esperado 408).
- [ ] **Step 3:** Commitar o plano:

```bash
git add docs/superpowers/plans/2026-10-02-redesign-fase3-geral.md
git commit -m "docs: plano da Fase 3 do redesign (Geral)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 1: Peças novas — `Pagina`, `CabecalhoPagina`, `Segmentado`, `Chip`

Toda tela da fase usa a mesma moldura (respiro 16 px no celular, 32 px no desktop, 20 px entre blocos) e o mesmo cabeçalho (título 24 px, subtítulo, ações à direita). A janela de compromisso usa um controle segmentado (Pendente | Concluído | Cancelado); filtros e setores usam chips.

**Files:**
- Create: `components/ui/Pagina.tsx`, `components/ui/Segmentado.tsx`, `components/ui/Chip.tsx`
- Modify: `components/ui/index.ts`, `components/ui/README.md`
- Test: `tests/ui-pagina.test.ts`

**Interfaces:**
- Produces:
  - `Pagina({ className?, children })` — `<div class="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7">`.
  - `CabecalhoPagina({ titulo, subtitulo?, acoes?, className? })` — `<h1>` + `<p>`; ações num `div` com `print:hidden`.
  - `Segmentado<T extends string>({ rotulo: string, opcoes: { valor: T; rotulo: string }[], valor: T, onMudar: (v: T) => void, disabled?, className? })` — `role="radiogroup"`, botões `role="radio"`, setas ←/→ trocam.
  - `Chip({ ativo: boolean, ...ButtonHTMLAttributes })` — botão com `aria-pressed`.

- [ ] **Step 1: Teste que falha** — `tests/ui-pagina.test.ts`:

```ts
// tests/ui-pagina.test.ts — moldura da página, segmentado e chip.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pagina, CabecalhoPagina } from '../components/ui/Pagina'
import { Segmentado } from '../components/ui/Segmentado'
import { Chip } from '../components/ui/Chip'

const nada = () => {}

test('Pagina: respiro do celular e do desktop', () => {
  const html = renderToStaticMarkup(h(Pagina, null, 'x'))
  assert.match(html, /px-4/)
  assert.match(html, /sm:px-8/)
  assert.match(html, /gap-5/)
})

test('CabecalhoPagina: título h1, subtítulo e ações fora da impressão', () => {
  const html = renderToStaticMarkup(h(CabecalhoPagina, { titulo: 'Início', subtitulo: 'Sua agenda', acoes: h('button', null, 'Novo') }))
  assert.match(html, /<h1[^>]*>Início<\/h1>/)
  assert.match(html, /<p[^>]*>Sua agenda<\/p>/)
  assert.match(html, /print:hidden[^>]*><button>Novo<\/button>/)
  assert.doesNotMatch(renderToStaticMarkup(h(CabecalhoPagina, { titulo: 'X' })), /print:hidden/)
})

test('Segmentado: grupo de rádio com uma opção marcada e só ela no Tab', () => {
  const html = renderToStaticMarkup(h(Segmentado, {
    rotulo: 'Situação',
    opcoes: [{ valor: 'pendente', rotulo: 'Pendente' }, { valor: 'concluido', rotulo: 'Concluído' }, { valor: 'cancelado', rotulo: 'Cancelado' }],
    valor: 'concluido',
    onMudar: nada,
  }))
  assert.match(html, /role="radiogroup"[^>]*aria-label="Situação"|aria-label="Situação"[^>]*role="radiogroup"/)
  assert.equal((html.match(/role="radio"/g) ?? []).length, 3)
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1)
  assert.match(html, /aria-checked="true"[^>]*tabindex="0"[^>]*>Concluído|tabindex="0"[^>]*aria-checked="true"[^>]*>Concluído/)
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 2)
})

test('Chip: aria-pressed e marca de seleção só quando ativo', () => {
  const on = renderToStaticMarkup(h(Chip, { ativo: true, onClick: nada }, 'Fiscal'))
  const off = renderToStaticMarkup(h(Chip, { ativo: false, onClick: nada }, 'Fiscal'))
  assert.match(on, /aria-pressed="true"/)
  assert.match(on, /<svg/)
  assert.match(off, /aria-pressed="false"/)
  assert.doesNotMatch(off, /<svg/)
  assert.match(off, /type="button"/)
})
```

- [ ] **Step 2:** `node --import tsx --test tests/ui-pagina.test.ts` → FAIL (módulos não existem).

- [ ] **Step 3: Implementar** — `components/ui/Pagina.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

// Moldura do conteúdo de cada página dentro da casca: 16 px de respiro no
// celular, 32 px a partir de 640 px e 20 px entre os blocos.
export function Pagina({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7', className)}>{children}</div>
}

export function CabecalhoPagina({ titulo, subtitulo, acoes, className }: {
  titulo: ReactNode
  subtitulo?: ReactNode
  acoes?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-.01em] text-fg">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-fg-3">{subtitulo}</p>}
      </div>
      {acoes && <div className="ml-auto flex flex-wrap items-center gap-2.5 print:hidden">{acoes}</div>}
    </div>
  )
}
```

`components/ui/Segmentado.tsx`:

```tsx
import type { KeyboardEvent } from 'react'
import { cn } from './cn'

export interface OpcaoSegmentada<T extends string> { valor: T; rotulo: string }

export function Segmentado<T extends string>({ rotulo, opcoes, valor, onMudar, disabled = false, className }: {
  rotulo: string
  opcoes: OpcaoSegmentada<T>[]
  valor: T
  onMudar: (v: T) => void
  disabled?: boolean
  className?: string
}) {
  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const atual = opcoes.findIndex(o => o.valor === valor)
    const indice = (atual + (e.key === 'ArrowRight' ? 1 : -1) + opcoes.length) % opcoes.length
    onMudar(opcoes[indice].valor)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[indice]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      onKeyDown={teclado}
      className={cn('inline-flex h-9 max-w-full overflow-hidden rounded-[9px] border border-line bg-inset', className)}
    >
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            disabled={disabled}
            onClick={() => onMudar(o.valor)}
            className={cn(
              'whitespace-nowrap border-l border-line px-3.5 text-sm text-fg-2 transition-colors first:border-l-0 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-60',
              ativo && 'bg-acc-soft font-semibold text-fg shadow-[inset_0_-2px_0_var(--acc)]',
            )}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}
```

`components/ui/Chip.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'

// Opção liga/desliga em forma de pílula (filtros, setores do cliente).
export function Chip({ ativo, className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ativo: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={ativo}
      className={cn(
        'inline-flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-60',
        ativo ? 'border-[color-mix(in_srgb,var(--acc)_55%,transparent)] bg-acc-soft text-fg' : 'border-line text-fg-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {ativo && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </button>
  )
}
```

`components/ui/index.ts` — acrescentar no fim:

```ts
export { Pagina, CabecalhoPagina } from './Pagina'
export { Segmentado, type OpcaoSegmentada } from './Segmentado'
export { Chip } from './Chip'
```

`components/ui/README.md` — acrescentar à tabela, antes de `Card, Aviso…`:

```md
| `Pagina` + `CabecalhoPagina` | Moldura e cabeçalho de toda página dentro da casca (título, subtítulo, ações). |
| `Segmentado` | Escolha única entre 2–4 opções curtas (ex.: situação do compromisso). |
| `Chip` | Filtro ou opção liga/desliga em pílula (`aria-pressed`). |
```

- [ ] **Step 4:** `node --import tsx --test tests/ui-pagina.test.ts` → PASS; `npm test` → todos passam; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit**

```bash
git add components/ui/Pagina.tsx components/ui/Segmentado.tsx components/ui/Chip.tsx components/ui/index.ts components/ui/README.md tests/ui-pagina.test.ts
git commit -m "feat(ui): moldura de página, controle segmentado e chip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Login e Redefinir senha

Pranchetas `g-01-login`, `g-02-redefinir`, `mob-01-login`. Mesmos campos e fluxos de hoje (entrar, permanecer conectado, esqueci minha senha → e-mail enviado; link do e-mail → nova senha), com rótulos ligados, mostrar senha por campo, erro dentro do cartão, campos e botão de 44 px.

**Files:**
- Create: `lib/senha.ts`, `components/auth/CampoSenha.tsx`, `components/auth/TelaAcesso.tsx`
- Modify (reescrever): `components/auth/LoginForm.tsx`, `app/login/page.tsx`, `app/auth/reset-password/page.tsx`
- Test: `tests/senha.test.ts`

**Interfaces:**
- Consumes: `Field`, `Input`, `Checkbox`, `Button`, `IconButton`, `Aviso` de `components/ui`.
- Produces: `validarNovaSenha(nova: string, confirmar: string): ErroSenha | null`, `SENHA_MINIMA = 6`, `type ErroSenha = { campo: 'nova' | 'confirmar'; mensagem: string }`; `CampoSenha` (props de `<input>` menos `type`, mais `invalido?`); `TelaAcesso({ children, rodape? })`.

- [ ] **Step 1: Teste que falha** — `tests/senha.test.ts`:

```ts
// tests/senha.test.ts — regra da nova senha (Redefinir senha).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarNovaSenha, SENHA_MINIMA } from '../lib/senha'

test('menos de 6 caracteres: erro no campo da nova senha', () => {
  assert.equal(SENHA_MINIMA, 6)
  assert.deepEqual(validarNovaSenha('12345', '12345'), { campo: 'nova', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' })
})

test('exatamente 6 e iguais: sem erro', () => {
  assert.equal(validarNovaSenha('123456', '123456'), null)
})

test('diferentes: erro no campo de confirmação (espaço no fim conta)', () => {
  assert.deepEqual(validarNovaSenha('123456', '123456 '), { campo: 'confirmar', mensagem: 'As senhas não são iguais.' })
  assert.deepEqual(validarNovaSenha('abcdef', ''), { campo: 'confirmar', mensagem: 'As senhas não são iguais.' })
})

test('tamanho é conferido antes da igualdade', () => {
  assert.equal(validarNovaSenha('123', '456')?.campo, 'nova')
})
```

- [ ] **Step 2:** `node --import tsx --test tests/senha.test.ts` → FAIL.

- [ ] **Step 3: `lib/senha.ts`**

```ts
// lib/senha.ts — regra da nova senha (a mesma do Supabase: mínimo de 6 caracteres).
export const SENHA_MINIMA = 6

export interface ErroSenha { campo: 'nova' | 'confirmar'; mensagem: string }

export function validarNovaSenha(nova: string, confirmar: string): ErroSenha | null {
  if (nova.length < SENHA_MINIMA) return { campo: 'nova', mensagem: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` }
  if (nova !== confirmar) return { campo: 'confirmar', mensagem: 'As senhas não são iguais.' }
  return null
}
```

- [ ] **Step 4:** teste passa.

- [ ] **Step 5: `components/auth/CampoSenha.tsx`**

```tsx
'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'

// Campo de senha com botão de mostrar/ocultar; 44 px de altura (telas de acesso).
export function CampoSenha({ invalido, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalido?: boolean }) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <div className="relative min-w-0">
      <Input type={mostrar ? 'text' : 'password'} invalido={invalido} className={cn('h-11 pr-12', className)} {...rest} />
      <IconButton
        rotulo={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        icone={mostrar ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        onClick={() => setMostrar(v => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
      />
    </div>
  )
}
```

- [ ] **Step 6: `components/auth/TelaAcesso.tsx`** (logo real `/logo.png`, como hoje)

```tsx
import Image from 'next/image'
import type { ReactNode } from 'react'

// Moldura das telas fora do portal (login e redefinir senha).
export function TelaAcesso({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3.5">
          <Image src="/logo.png" alt="" width={72} height={72} className="rounded-[18px]" unoptimized priority />
          <div className="text-center">
            <p className="text-xl font-semibold text-fg">Tesserato Contabilidade</p>
            <p className="mt-0.5 text-[13px] text-fg-3">Portal do Colaborador</p>
          </div>
        </div>
        <div className="rounded-xl border border-line-soft bg-surface p-6 sm:p-7">{children}</div>
        {rodape}
      </div>
    </main>
  )
}
```

- [ ] **Step 7: `app/login/page.tsx`**

```tsx
import LoginForm from '@/components/auth/LoginForm'
import { TelaAcesso } from '@/components/auth/TelaAcesso'

export const metadata = { title: 'Entrar — Tesserato' }

export default function LoginPage() {
  return (
    <TelaAcesso>
      <LoginForm />
    </TelaAcesso>
  )
}
```

- [ ] **Step 8: `components/auth/LoginForm.tsx`** — manter **exatamente** a lógica de hoje (`handleSubmit` com `signInWithPassword`, o `beforeunload` de "Permanecer conectado", `router.push('/')` + `refresh()`; `handleEsqueciSenha` com `resetPasswordForEmail` e `redirectTo = ${window.location.origin}/auth/reset-password`; os três `view`). Trocar só a interface:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { CampoSenha } from './CampoSenha'

type View = 'login' | 'forgot' | 'forgot_sent'

export default function LoginForm() {
  // ...estados, handleSubmit e handleEsqueciSenha IGUAIS ao arquivo atual...

  if (view === 'forgot_sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ok-soft text-ok"><Mail size={24} /></span>
        <h2 className="text-lg font-semibold text-fg">E-mail enviado</h2>
        <p className="text-[13px] text-fg-2">
          Abra a caixa de entrada de <b className="font-semibold text-fg">{emailReset}</b> e siga o link para criar a nova senha.
        </p>
        <button type="button" onClick={() => { setView('login'); setEmailReset('') }} className="mt-1 text-[13px] font-semibold text-acc-text hover:underline">
          Voltar ao login
        </button>
      </div>
    )
  }

  if (view === 'forgot') {
    return (
      <form onSubmit={handleEsqueciSenha} aria-label="Redefinir senha" className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Redefinir senha</h2>
          <p className="mt-1 text-[13px] text-fg-2">Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
        </div>
        <Field rotulo="E-mail" erro={erroReset}>
          {c => (
            <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} type="email" autoComplete="email" required autoFocus
              value={emailReset} onChange={e => setEmailReset(e.target.value)} placeholder="seu@email.com" className="h-11" />
          )}
        </Field>
        <Button type="submit" variante="primario" tamanho="g" carregando={enviandoReset} className="w-full">
          {enviandoReset ? 'Enviando…' : 'Enviar link'}
        </Button>
        <button type="button" onClick={() => setView('login')} className="text-center text-[13px] text-fg-2 hover:text-fg">Voltar ao login</button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Entrar" className="flex flex-col gap-4">
      <Field rotulo="E-mail">
        {c => (
          <Input id={c.id} type="email" autoComplete="email" required invalido={Boolean(erro)}
            value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="h-11" />
        )}
      </Field>
      <Field rotulo="Senha">
        {c => (
          <CampoSenha id={c.id} autoComplete="current-password" required invalido={Boolean(erro)}
            value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox rotulo="Permanecer conectado" checked={lembrar} onChange={e => setLembrar(e.target.checked)} />
        <button type="button" onClick={() => { setView('forgot'); setEmailReset(email) }} className="text-[13px] font-semibold text-acc-text hover:underline">
          Esqueci minha senha
        </button>
      </div>
      {erro && (
        <div role="alert">
          <Aviso tom="dng"><b>{erro}</b> Confira e tente de novo.</Aviso>
        </div>
      )}
      <Button type="submit" variante="primario" tamanho="g" carregando={carregando} className="w-full">
        {carregando ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 9: `app/auth/reset-password/page.tsx`** — mesma lógica de hoje (aguardar `PASSWORD_RECOVERY` ou sessão; `updateUser({ password })`; ao salvar, `setTimeout(() => router.push('/login'), 2500)`), com estas mudanças: a validação usa `validarNovaSenha` e mostra o erro **no campo**; o `onAuthStateChange` passa a ser desinscrito na desmontagem; cada campo tem o seu mostrar senha.

```tsx
'use client'

import { useState, useEffect, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TelaAcesso } from '@/components/auth/TelaAcesso'
import { CampoSenha } from '@/components/auth/CampoSenha'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { validarNovaSenha, SENHA_MINIMA, type ErroSenha } from '@/lib/senha'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroCampo, setErroCampo] = useState<ErroSenha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pronto, setPronto] = useState(false)

  // O Supabase volta do e-mail com tokens na URL — aguarda a sessão de recuperação.
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setPronto(true)
    })
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setPronto(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const invalido = validarNovaSenha(novaSenha, confirmar)
    setErroCampo(invalido)
    if (invalido) return
    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setOk(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <TelaAcesso rodape={<Link href="/login" className="text-center text-[13px] text-fg-2 hover:text-fg">Voltar ao login</Link>}>
      {ok ? (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
          <h1 className="text-lg font-semibold text-fg">Senha redefinida</h1>
          <p className="text-[13px] text-fg-2">Abrindo o login…</p>
        </div>
      ) : !pronto ? (
        <p role="status" className="py-4 text-center text-sm text-fg-3">Verificando o link…</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold text-fg">Nova senha</h1>
            <p className="mt-1 text-[13px] text-fg-2">Escolha uma nova senha para sua conta.</p>
          </div>
          <Field rotulo="Nova senha" ajuda={`Mínimo de ${SENHA_MINIMA} caracteres`} erro={erroCampo?.campo === 'nova' ? erroCampo.mensagem : null}>
            {c => (
              <CampoSenha id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} autoComplete="new-password" autoFocus
                value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
            )}
          </Field>
          <Field rotulo="Confirmar senha" erro={erroCampo?.campo === 'confirmar' ? erroCampo.mensagem : null}>
            {c => (
              <CampoSenha id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} autoComplete="new-password"
                value={confirmar} onChange={e => setConfirmar(e.target.value)} />
            )}
          </Field>
          {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
          <Button type="submit" variante="primario" tamanho="g" carregando={salvando} className="w-full">
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      )}
    </TelaAcesso>
  )
}
```

- [ ] **Step 10:** `npm test`, `npx tsc --noEmit`, `npx eslint components/auth app/login app/auth lib/senha.ts` → limpos. Conferir no arquivo: nenhum `[var(--`, `red-400`, `green-`, `text-[10px]`.
- [ ] **Step 11: Commit**

```bash
git add lib/senha.ts tests/senha.test.ts components/auth app/login/page.tsx app/auth/reset-password/page.tsx
git commit -m "feat(acesso): login e redefinir senha no desenho novo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Regras da agenda — `lib/agenda.ts`

Hoje a agenda existe em duas cópias (`components/fiscal/AgendaPessoal.tsx` e `app/fiscal/agenda/page.tsx`) com regras diferentes. As regras vão para um só lugar, puras.

**Files:**
- Create: `lib/agenda.ts`
- Test: `tests/agenda.test.ts`

**Interfaces:**
- Consumes: `MESES` de `lib/mes-navegacao.ts`.
- Produces (todos com `mes` de **1 a 12**):
  - tipos `StatusCompromisso`, `TomCompromisso = 'warn' | 'acc' | 'ok' | 'neu'`, `Compromisso`, `FormCompromisso`
  - `STATUS_ROTULO`, `DIAS_SEMANA`
  - `chaveDia(ano, mes, dia): string` (aaaa-mm-dd), `chaveDeHoje(hoje: Date): string`
  - `celulasDoMes(ano, mes): (number | null)[]`
  - `diasAte(data: string, hoje: Date): number`
  - `tomDoCompromisso(c, hoje): TomCompromisso`
  - `compromissosDoDia(itens, chave): Compromisso[]` (ordenado por horário, sem horário no fim)
  - `lembretesProximos(itens, hoje): Compromisso[]`
  - `horaCurta(hora?): string`, `rotuloLembrete(c, hoje): string`, `tituloDoDia(ano, mes, dia): string`, `contarCompromissos(n): string`
  - `formVazio(data?): FormCompromisso`, `validarCompromisso(f): { titulo?: string; data_compromisso?: string }`, `payloadCompromisso(f): FormCompromisso`

- [ ] **Step 1: Teste que falha** — `tests/agenda.test.ts`:

```ts
// tests/agenda.test.ts — regras da agenda pessoal (Início e /fiscal/agenda).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  celulasDoMes, chaveDia, chaveDeHoje, diasAte, tomDoCompromisso, compromissosDoDia, lembretesProximos,
  rotuloLembrete, tituloDoDia, contarCompromissos, validarCompromisso, payloadCompromisso, formVazio, horaCurta,
  type Compromisso,
} from '../lib/agenda'

const hoje = new Date(2026, 8, 30, 15, 20) // 30/09/2026, meio da tarde
const c = (id: string, data: string, extra: Partial<Compromisso> = {}): Compromisso => ({
  id, usuario_id: 'u1', titulo: id, descricao: null, data_compromisso: data, hora_compromisso: null,
  status: 'pendente', lembrete_3_dias: false, ...extra,
})

test('setembro/2026 começa na terça: 2 casas vazias, 35 casas', () => {
  const g = celulasDoMes(2026, 9)
  assert.equal(g.length, 35)
  assert.deepEqual(g.slice(0, 3), [null, null, 1])
  assert.equal(g[31], 30)
  assert.deepEqual(g.slice(32), [null, null, null])
})

test('fevereiro/2026 começa no domingo e tem 28 dias: 4 semanas exatas', () => {
  const g = celulasDoMes(2026, 2)
  assert.equal(g.length, 28)
  assert.equal(g[0], 1)
  assert.equal(g[27], 28)
})

test('agosto/2026 começa no sábado: 6 semanas', () => {
  const g = celulasDoMes(2026, 8)
  assert.equal(g.length, 42)
  assert.equal(g.indexOf(1), 6)
  assert.equal(g.indexOf(31), 36)
})

test('chaves de dia com zero à esquerda', () => {
  assert.equal(chaveDia(2026, 3, 5), '2026-03-05')
  assert.equal(chaveDeHoje(hoje), '2026-09-30')
})

test('diasAte: amanhã, ontem e virada de ano', () => {
  assert.equal(diasAte('2026-10-01', new Date(2026, 8, 30, 23, 59)), 1)
  assert.equal(diasAte('2026-09-29', hoje), -1)
  assert.equal(diasAte('2027-01-02', new Date(2026, 11, 31)), 2)
})

test('cor: concluído verde, cancelado cinza, pendente com aviso nos 3 dias âmbar, senão ciano', () => {
  assert.equal(tomDoCompromisso(c('a', '2026-09-30', { status: 'concluido', lembrete_3_dias: true }), hoje), 'ok')
  assert.equal(tomDoCompromisso(c('a', '2026-09-30', { status: 'cancelado' }), hoje), 'neu')
  assert.equal(tomDoCompromisso(c('a', '2026-10-03', { lembrete_3_dias: true }), hoje), 'warn')
  assert.equal(tomDoCompromisso(c('a', '2026-10-04', { lembrete_3_dias: true }), hoje), 'acc')
  assert.equal(tomDoCompromisso(c('a', '2026-09-29', { lembrete_3_dias: true }), hoje), 'acc')
  assert.equal(tomDoCompromisso(c('a', '2026-09-30'), hoje), 'acc')
})

test('lembretes: pendentes de hoje até +3 dias, por data e horário (sem horário por último)', () => {
  const itens = [
    c('d4', '2026-10-04'),
    c('ontem', '2026-09-29'),
    c('feito', '2026-09-30', { status: 'concluido' }),
    c('hoje-sem-hora', '2026-09-30'),
    c('hoje-16h', '2026-09-30', { hora_compromisso: '16:00' }),
    c('hoje-9h', '2026-09-30', { hora_compromisso: '09:00:00' }),
    c('d3', '2026-10-03'),
  ]
  assert.deepEqual(lembretesProximos(itens, hoje).map(i => i.id), ['hoje-9h', 'hoje-16h', 'hoje-sem-hora', 'd3'])
})

test('lembretes atravessam a virada de ano', () => {
  const r = lembretesProximos([c('ano-novo', '2027-01-02')], new Date(2026, 11, 31))
  assert.deepEqual(r.map(i => i.id), ['ano-novo'])
})

test('compromissos do dia em ordem de horário', () => {
  const itens = [c('b', '2026-09-30', { hora_compromisso: '18:00' }), c('x', '2026-10-01'), c('a', '2026-09-30', { hora_compromisso: '09:00' })]
  assert.deepEqual(compromissosDoDia(itens, '2026-09-30').map(i => i.id), ['a', 'b'])
})

test('rótulos', () => {
  assert.equal(horaCurta('09:00:00'), '09:00')
  assert.equal(horaCurta(null), '')
  assert.equal(rotuloLembrete(c('Enviar SPED', '2026-09-30', { hora_compromisso: '09:00:00' }), hoje), 'Hoje 09:00 · Enviar SPED')
  assert.equal(rotuloLembrete(c('Ligar', '2026-10-01'), hoje), 'Amanhã · Ligar')
  assert.equal(rotuloLembrete(c('Reunião', '2026-10-03', { hora_compromisso: '14:00' }), hoje), '03/10 14:00 · Reunião')
  assert.equal(tituloDoDia(2026, 9, 30), '30 de setembro de 2026')
  assert.equal(contarCompromissos(0), 'Nenhum compromisso')
  assert.equal(contarCompromissos(1), '1 compromisso')
  assert.equal(contarCompromissos(3), '3 compromissos')
})

test('formulário: título e data obrigatórios; payload limpa espaços e vazios', () => {
  assert.deepEqual(validarCompromisso(formVazio()), { titulo: 'Informe o título.', data_compromisso: 'Informe a data.' })
  assert.deepEqual(validarCompromisso({ ...formVazio('2026-09-30'), titulo: '   ' }), { titulo: 'Informe o título.' })
  assert.deepEqual(validarCompromisso({ ...formVazio('2026-09-30'), titulo: 'Ok' }), {})
  const p = payloadCompromisso({ ...formVazio('2026-09-30'), titulo: '  Enviar SPED ', descricao: '  ', hora_compromisso: '' })
  assert.equal(p.titulo, 'Enviar SPED')
  assert.equal(p.descricao, null)
  assert.equal(p.hora_compromisso, null)
  assert.equal(formVazio('2026-09-30').status, 'pendente')
})
```

- [ ] **Step 2:** `node --import tsx --test tests/agenda.test.ts` → FAIL.

- [ ] **Step 3: `lib/agenda.ts`**

```ts
// lib/agenda.ts — regras da agenda pessoal (Início e /fiscal/agenda).
// Funções puras, sem React e sem Supabase; testadas em tests/agenda.test.ts.
// `mes` sempre de 1 a 12.
import { MESES } from './mes-navegacao'

export type StatusCompromisso = 'pendente' | 'concluido' | 'cancelado'
export type TomCompromisso = 'warn' | 'acc' | 'ok' | 'neu'

export interface Compromisso {
  id: string
  usuario_id: string
  titulo: string
  descricao?: string | null
  data_compromisso: string // aaaa-mm-dd
  hora_compromisso?: string | null // hh:mm (pode vir com segundos)
  status: StatusCompromisso
  lembrete_3_dias: boolean
}

export type FormCompromisso = Pick<Compromisso, 'titulo' | 'descricao' | 'data_compromisso' | 'hora_compromisso' | 'status' | 'lembrete_3_dias'>

export const STATUS_ROTULO: Record<StatusCompromisso, string> = { pendente: 'Pendente', concluido: 'Concluído', cancelado: 'Cancelado' }
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

const dois = (n: number) => String(n).padStart(2, '0')

export function chaveDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${dois(mes)}-${dois(dia)}`
}

export function chaveDeHoje(hoje: Date): string {
  return chaveDia(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())
}

/** Grade do mês começando no domingo; `null` = casa vazia. Sempre múltiplo de 7. */
export function celulasDoMes(ano: number, mes: number): (number | null)[] {
  const primeiro = new Date(ano, mes - 1, 1).getDay()
  const dias = new Date(ano, mes, 0).getDate()
  const celulas: (number | null)[] = Array.from({ length: primeiro }, () => null)
  for (let d = 1; d <= dias; d++) celulas.push(d)
  while (celulas.length % 7 !== 0) celulas.push(null)
  return celulas
}

/** Dias corridos de hoje até a data (negativo = já passou). Conta em UTC para não sofrer com horário de verão. */
export function diasAte(data: string, hoje: Date): number {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86_400_000)
}

function dentroDe3Dias(data: string, hoje: Date): boolean {
  const d = diasAte(data, hoje)
  return d >= 0 && d <= 3
}

/** Cor no calendário. Legenda: Pendente em até 3 dias (âmbar) · Pendente (ciano) · Concluído (verde) · Cancelado (cinza). */
export function tomDoCompromisso(c: Pick<Compromisso, 'status' | 'data_compromisso' | 'lembrete_3_dias'>, hoje: Date): TomCompromisso {
  if (c.status === 'concluido') return 'ok'
  if (c.status === 'cancelado') return 'neu'
  if (c.lembrete_3_dias && dentroDe3Dias(c.data_compromisso, hoje)) return 'warn'
  return 'acc'
}

/** Pelo horário; sem horário vai para o fim do dia. */
function porHorario(a: Compromisso, b: Compromisso): number {
  return (a.hora_compromisso || '99:99').localeCompare(b.hora_compromisso || '99:99') || a.titulo.localeCompare(b.titulo)
}

export function compromissosDoDia(itens: Compromisso[], chave: string): Compromisso[] {
  return itens.filter(i => i.data_compromisso === chave).sort(porHorario)
}

/** Pendentes de hoje até daqui a 3 dias, do mais próximo para o mais distante. */
export function lembretesProximos(itens: Compromisso[], hoje: Date): Compromisso[] {
  return itens
    .filter(i => i.status === 'pendente' && dentroDe3Dias(i.data_compromisso, hoje))
    .sort((a, b) => a.data_compromisso.localeCompare(b.data_compromisso) || porHorario(a, b))
}

export function horaCurta(hora?: string | null): string {
  return hora ? hora.slice(0, 5) : ''
}

/** "Hoje 09:00 · Enviar SPED", "Amanhã · Ligar", "03/10 14:00 · Reunião". */
export function rotuloLembrete(c: Compromisso, hoje: Date): string {
  const d = diasAte(c.data_compromisso, hoje)
  const [, m, dia] = c.data_compromisso.split('-')
  const quando = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `${dia}/${m}`
  const hora = horaCurta(c.hora_compromisso)
  return `${quando}${hora ? ` ${hora}` : ''} · ${c.titulo}`
}

/** "30 de setembro de 2026" */
export function tituloDoDia(ano: number, mes: number, dia: number): string {
  return `${dia} de ${MESES[mes - 1].toLowerCase()} de ${ano}`
}

export function contarCompromissos(n: number): string {
  return n === 0 ? 'Nenhum compromisso' : n === 1 ? '1 compromisso' : `${n} compromissos`
}

export function formVazio(data = ''): FormCompromisso {
  return { titulo: '', descricao: '', data_compromisso: data, hora_compromisso: '', status: 'pendente', lembrete_3_dias: false }
}

export function validarCompromisso(f: FormCompromisso): { titulo?: string; data_compromisso?: string } {
  const erros: { titulo?: string; data_compromisso?: string } = {}
  if (!f.titulo.trim()) erros.titulo = 'Informe o título.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data_compromisso)) erros.data_compromisso = 'Informe a data.'
  return erros
}

/** O que vai para o banco: título sem espaços nas pontas; descrição e horário vazios viram null. */
export function payloadCompromisso(f: FormCompromisso): FormCompromisso {
  return { ...f, titulo: f.titulo.trim(), descricao: f.descricao?.trim() || null, hora_compromisso: f.hora_compromisso || null }
}
```

- [ ] **Step 4:** teste passa; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit**

```bash
git add lib/agenda.ts tests/agenda.test.ts
git commit -m "feat(agenda): regras da agenda em funções puras" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Agenda única — Início e `/fiscal/agenda`

Pranchetas `g-03-inicio`, `g-04-inicio-dia`, `m-11-compromisso`, `mob-02-inicio`, `f-15-agenda`. Ordem do Início: cabeçalho (com "Novo compromisso") → comunicado da administração → lembretes dos próximos 3 dias → calendário do mês em largura total (compromissos escritos nos dias; no celular, pontos) → (celular) lista de hoje → links úteis (Task 5 troca o componente; nesta task o Início continua com `LinksRapidos`).

**Files:**
- Create: `components/geral/agenda/CalendarioMes.tsx`, `components/geral/agenda/DiaModal.tsx`, `components/geral/agenda/CompromissoModal.tsx`, `components/geral/agenda/Agenda.tsx`
- Modify (reescrever): `app/(comum)/intranet/page.tsx`, `app/fiscal/agenda/page.tsx`
- Delete: `components/fiscal/AgendaPessoal.tsx`
- Test: `tests/agenda-calendario.test.ts`

**Interfaces:**
- Consumes: tudo de `lib/agenda.ts` (Task 3); `mesVizinho`, `rotuloMes` de `lib/mes-navegacao.ts`; `Pagina`, `CabecalhoPagina`, `Segmentado` (Task 1); `Modal`, `Button`, `IconButton`, `Badge`, `Field`, `Input`, `Textarea`, `Switch`, `Aviso`, `useConfirmar`, `useToast`.
- Produces:
  - `CalendarioMes({ ano, mes, hoje, itens, onAbrirDia(dia), onMesAnterior, onProximoMes, onHoje })` e `PONTO_DO_TOM: Record<TomCompromisso, string>`
  - `DiaModal({ aberto, titulo, ehHoje, itens, hoje, onNovo, onEditar(c), onExcluir(c), onFechar })`
  - `CompromissoModal({ aberto, inicial, editando, salvando, onSalvar(f), onFechar })`
  - `Agenda({ titulo, subtitulo, topo? })` (default export)

- [ ] **Step 1: Teste que falha** — `tests/agenda-calendario.test.ts`:

```ts
// tests/agenda-calendario.test.ts — calendário do mês da agenda.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarioMes } from '../components/geral/agenda/CalendarioMes'
import type { Compromisso } from '../lib/agenda'

const nada = () => {}
const c = (id: string, data: string, titulo: string, extra: Partial<Compromisso> = {}): Compromisso => ({
  id, usuario_id: 'u1', titulo, descricao: null, data_compromisso: data, hora_compromisso: null,
  status: 'pendente', lembrete_3_dias: false, ...extra,
})
const itens = [
  c('1', '2026-09-30', 'Enviar SPED', { hora_compromisso: '09:00:00', lembrete_3_dias: true }),
  c('2', '2026-09-30', 'Ligar para cliente', { hora_compromisso: '16:00' }),
  c('3', '2026-09-30', 'Conferir backup', { hora_compromisso: '18:00' }),
  c('4', '2026-09-24', 'Visita a cliente', { status: 'cancelado' }),
]
const html = renderToStaticMarkup(h(CalendarioMes, {
  ano: 2026, mes: 9, hoje: new Date(2026, 8, 30), itens,
  onAbrirDia: nada, onMesAnterior: nada, onProximoMes: nada, onHoje: nada,
}))

test('título com o mês e navegação', () => {
  assert.match(html, /Minha agenda · Setembro 2026/)
  assert.match(html, /aria-label="Mês anterior"/)
  assert.match(html, /aria-label="Próximo mês"/)
  assert.match(html, />Hoje</)
})

test('um botão por dia, com rótulo falado, e 5 casas vazias', () => {
  assert.equal((html.match(/aria-label="\d+ de setembro de 2026: /g) ?? []).length, 30)
  assert.equal((html.match(/<div aria-hidden="true" class="border-b/g) ?? []).length, 5)
})

test('hoje marcado com aria-current="date"', () => {
  assert.match(html, /aria-label="30 de setembro de 2026: 3 compromissos"[^>]*aria-current="date"|aria-current="date"[^>]*aria-label="30 de setembro de 2026: 3 compromissos"/)
  assert.equal((html.match(/aria-current="date"/g) ?? []).length, 1)
})

test('até 2 compromissos escritos no dia e "+ 1 mais"', () => {
  assert.match(html, /09:00/)
  assert.match(html, /Enviar SPED/)
  assert.match(html, /Ligar para cliente/)
  assert.doesNotMatch(html, /Conferir backup/)
  assert.match(html, /\+ 1 mais/)
})

test('cores: âmbar no lembrete, riscado no cancelado', () => {
  assert.match(html, /bg-warn-soft[^"]*"[^>]*><b[^>]*>09:00/)
  assert.match(html, /line-through[^"]*"[^>]*>(<b[^>]*>[^<]*<\/b>)?<span[^>]*>Visita a cliente/)
})
```

- [ ] **Step 2:** `node --import tsx --test tests/agenda-calendario.test.ts` → FAIL.

- [ ] **Step 3: `components/geral/agenda/CalendarioMes.tsx`**

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { rotuloMes } from '@/lib/mes-navegacao'
import {
  DIAS_SEMANA, celulasDoMes, chaveDia, chaveDeHoje, compromissosDoDia, contarCompromissos, horaCurta,
  tituloDoDia, tomDoCompromisso, type Compromisso, type TomCompromisso,
} from '@/lib/agenda'

export const PONTO_DO_TOM: Record<TomCompromisso, string> = { warn: 'bg-warn', acc: 'bg-acc', ok: 'bg-ok', neu: 'bg-fg-3' }
const ETIQUETA: Record<TomCompromisso, string> = {
  warn: 'bg-warn-soft text-warn',
  acc: 'bg-acc-soft text-acc-text',
  ok: 'bg-ok-soft text-ok',
  neu: 'bg-neutral-soft text-fg-3',
}
const LEGENDA: [TomCompromisso, string][] = [['warn', 'Pendente em até 3 dias'], ['acc', 'Pendente'], ['ok', 'Concluído'], ['neu', 'Cancelado']]

export function CalendarioMes({ ano, mes, hoje, itens, onAbrirDia, onMesAnterior, onProximoMes, onHoje }: {
  ano: number
  mes: number
  hoje: Date
  itens: Compromisso[]
  onAbrirDia: (dia: number) => void
  onMesAnterior: () => void
  onProximoMes: () => void
  onHoje: () => void
}) {
  const chaveHoje = chaveDeHoje(hoje)
  return (
    <section aria-label="Calendário do mês" className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-soft px-[18px] py-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{`Minha agenda · ${rotuloMes(mes, ano)}`}</h2>
        <ul aria-label="Legenda" className="hidden flex-wrap gap-4 text-[13px] text-fg-2 lg:flex">
          {LEGENDA.map(([tom, texto]) => (
            <li key={tom} className="inline-flex items-center gap-[7px]">
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', PONTO_DO_TOM[tom])} />
              {texto}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <Button variante="fantasma" tamanho="p" onClick={onHoje}>Hoje</Button>
          <IconButton rotulo="Mês anterior" icone={<ChevronLeft size={18} aria-hidden="true" />} onClick={onMesAnterior} />
          <IconButton rotulo="Próximo mês" icone={<ChevronRight size={18} aria-hidden="true" />} onClick={onProximoMes} />
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 border-b border-line-soft">
        {DIAS_SEMANA.map(d => (
          <span key={d} className="px-1 py-2 text-center text-xs font-semibold uppercase tracking-[.04em] text-fg-3 sm:px-3 sm:text-left">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celulasDoMes(ano, mes).map((dia, i) => {
          const borda = cn('border-b border-line-soft', i % 7 !== 6 && 'border-r')
          if (dia === null) {
            return <div key={i} aria-hidden="true" className={cn(borda, 'h-12 bg-[color-mix(in_srgb,var(--page)_60%,transparent)] sm:h-[104px]')} />
          }
          const chave = chaveDia(ano, mes, dia)
          const doDia = compromissosDoDia(itens, chave)
          const ehHoje = chave === chaveHoje
          return (
            <button
              key={i}
              type="button"
              onClick={() => onAbrirDia(dia)}
              aria-label={`${tituloDoDia(ano, mes, dia)}: ${contarCompromissos(doDia.length).toLowerCase()}`}
              aria-current={ehHoje ? 'date' : undefined}
              className={cn(
                borda,
                'flex h-12 min-w-0 flex-col items-center gap-0.5 overflow-hidden px-1 py-1.5 text-left transition-colors hover:bg-raised',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc sm:h-[104px] sm:items-stretch sm:px-2.5 sm:py-2',
                ehHoje && 'bg-acc-soft',
              )}
            >
              <span className={cn('text-[13px]', ehHoje ? 'grid h-6 w-6 place-items-center rounded-full bg-acc font-bold text-acc-ink' : 'font-medium text-fg-2')}>{dia}</span>
              <span aria-hidden="true" className="flex gap-0.5 sm:hidden">
                {doDia.slice(0, 3).map(item => (
                  <i key={item.id} className={cn('h-[5px] w-[5px] rounded-full', PONTO_DO_TOM[tomDoCompromisso(item, hoje)])} />
                ))}
              </span>
              <span aria-hidden="true" className="hidden min-w-0 flex-col sm:flex">
                {doDia.slice(0, 2).map(item => (
                  <span
                    key={item.id}
                    className={cn('mt-1 flex h-[22px] min-w-0 items-center gap-1.5 rounded-md px-[7px] text-xs', ETIQUETA[tomDoCompromisso(item, hoje)], item.status === 'cancelado' && 'line-through')}
                  >
                    {item.hora_compromisso && <b className="flex-none font-semibold">{horaCurta(item.hora_compromisso)}</b>}
                    <span className="truncate">{item.titulo}</span>
                  </span>
                ))}
                {doDia.length > 2 && <span className="mt-[3px] text-xs text-fg-3">{`+ ${doDia.length - 2} mais`}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 4:** teste passa.

- [ ] **Step 5: `components/geral/agenda/DiaModal.tsx`** (o primeiro compromisso vem aberto, como na prancheta; quem chama passa `key` = dia, para reabrir no primeiro ao trocar de dia)

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTom } from '@/components/ui/Badge'
import { cn } from '@/components/ui/cn'
import { STATUS_ROTULO, contarCompromissos, horaCurta, tomDoCompromisso, type Compromisso, type TomCompromisso } from '@/lib/agenda'
import { PONTO_DO_TOM } from './CalendarioMes'

const SELO: Record<TomCompromisso, BadgeTom> = { warn: 'warn', acc: 'acc', ok: 'ok', neu: 'neu' }

export function DiaModal({ aberto, titulo, ehHoje, itens, hoje, onNovo, onEditar, onExcluir, onFechar }: {
  aberto: boolean
  titulo: string
  ehHoje: boolean
  itens: Compromisso[]
  hoje: Date
  onNovo: () => void
  onEditar: (c: Compromisso) => void
  onExcluir: (c: Compromisso) => void
  onFechar: () => void
}) {
  const [aberta, setAberta] = useState<string | null>(itens[0]?.id ?? null)
  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      subtitulo={`${ehHoje ? 'Hoje · ' : ''}${contarCompromissos(itens.length)}`}
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar} className="ml-auto">Fechar</Button>
          <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={onNovo}>Novo compromisso</Button>
        </>
      }
    >
      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-3">Nenhum compromisso neste dia.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {itens.map(item => {
            const tom = tomDoCompromisso(item, hoje)
            const expandido = aberta === item.id
            const idDetalhe = `compromisso-${item.id}`
            return (
              <li key={item.id} className="rounded-[10px] border border-line-soft bg-page">
                <button
                  type="button"
                  aria-expanded={expandido}
                  aria-controls={idDetalhe}
                  onClick={() => setAberta(expandido ? null : item.id)}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
                >
                  <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', PONTO_DO_TOM[tom])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-semibold text-fg', item.status === 'cancelado' && 'line-through')}>{item.titulo}</span>
                    {item.hora_compromisso && <span className="text-[13px] text-fg-3">{horaCurta(item.hora_compromisso)}</span>}
                  </span>
                  <Badge tom={SELO[tom]}>{STATUS_ROTULO[item.status]}</Badge>
                  <ChevronDown size={16} aria-hidden="true" className={cn('flex-none text-fg-3 transition-transform', expandido && 'rotate-180')} />
                </button>
                {expandido && (
                  <div id={idDetalhe} className="px-3.5 pb-3.5 pl-[34px] text-[13px] text-fg-2">
                    {item.descricao
                      ? <p className="whitespace-pre-wrap break-words">{item.descricao}</p>
                      : <p className="italic text-fg-3">Sem descrição.</p>}
                    <div className="mt-3 flex gap-2">
                      <Button tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => onEditar(item)}>Editar</Button>
                      <Button tamanho="p" variante="perigo" icone={<Trash2 size={14} aria-hidden="true" />} onClick={() => onExcluir(item)}>Excluir</Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
```

- [ ] **Step 6: `components/geral/agenda/CompromissoModal.tsx`** (título em campo de uma linha; data e horário lado a lado; situação segmentada; "Avisar 3 dias antes"; erros só depois da primeira tentativa de salvar). Quem chama passa `key` para reiniciar o formulário a cada abertura.

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Textarea, Switch } from '@/components/ui/Input'
import { Segmentado } from '@/components/ui/Segmentado'
import { STATUS_ROTULO, validarCompromisso, type FormCompromisso, type StatusCompromisso } from '@/lib/agenda'

const SITUACOES = (['pendente', 'concluido', 'cancelado'] as StatusCompromisso[]).map(v => ({ valor: v, rotulo: STATUS_ROTULO[v] }))

export function CompromissoModal({ aberto, inicial, editando, salvando, onSalvar, onFechar }: {
  aberto: boolean
  inicial: FormCompromisso
  editando: boolean
  salvando: boolean
  onSalvar: (f: FormCompromisso) => void
  onFechar: () => void
}) {
  const [f, setF] = useState<FormCompromisso>(inicial)
  const [tentou, setTentou] = useState(false)
  const erros = validarCompromisso(f)
  const set = <K extends keyof FormCompromisso>(k: K, v: FormCompromisso[K]) => setF(p => ({ ...p, [k]: v }))

  function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (Object.keys(erros).length > 0) return
    onSalvar(f)
  }

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={salvando}
      titulo={editando ? 'Editar compromisso' : 'Novo compromisso'}
      subtitulo="Aparece só na sua agenda"
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar} disabled={salvando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" type="submit" form="form-compromisso" carregando={salvando}>{salvando ? 'Salvando…' : 'Salvar compromisso'}</Button>
        </>
      }
    >
      <form id="form-compromisso" onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Field rotulo="Título" obrigatorio erro={tentou ? erros.titulo : null}>
          {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} data-autofocus value={f.titulo} onChange={e => set('titulo', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field rotulo="Data" obrigatorio erro={tentou ? erros.data_compromisso : null}>
            {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} type="date" value={f.data_compromisso} onChange={e => set('data_compromisso', e.target.value)} />}
          </Field>
          <Field rotulo="Horário">
            {c => <Input id={c.id} type="time" value={f.hora_compromisso ?? ''} onChange={e => set('hora_compromisso', e.target.value)} />}
          </Field>
        </div>
        <Field rotulo="Descrição">
          {c => <Textarea id={c.id} rows={5} value={f.descricao ?? ''} onChange={e => set('descricao', e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Situação</span>
          <Segmentado rotulo="Situação" opcoes={SITUACOES} valor={f.status} onMudar={v => set('status', v)} />
        </div>
        <Switch ligado={f.lembrete_3_dias} onMudar={v => set('lembrete_3_dias', v)} rotulo="Avisar 3 dias antes" />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 7: `components/geral/agenda/Agenda.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Clock, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CabecalhoPagina } from '@/components/ui/Pagina'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { mesVizinho } from '@/lib/mes-navegacao'
import {
  chaveDia, chaveDeHoje, compromissosDoDia, formVazio, horaCurta, lembretesProximos, payloadCompromisso,
  rotuloLembrete, tituloDoDia, tomDoCompromisso, type Compromisso, type FormCompromisso,
} from '@/lib/agenda'
import { CalendarioMes, PONTO_DO_TOM } from './CalendarioMes'
import { DiaModal } from './DiaModal'
import { CompromissoModal } from './CompromissoModal'

// Agenda pessoal (tabela `agenda`, só os compromissos do próprio usuário).
// Usada no Início e em /fiscal/agenda.
export default function Agenda({ titulo, subtitulo, topo }: { titulo: string; subtitulo: string; topo?: ReactNode }) {
  const [hoje] = useState(() => new Date())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<Compromisso[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [diaAberto, setDiaAberto] = useState<number | null>(null)
  const [form, setForm] = useState<{ id: string | null; inicial: FormCompromisso } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sb] = useState(() => createClient())
  const confirmar = useConfirmar()
  const avisar = useToast()

  async function carregar(uid: string) {
    const { data, error } = await sb.from('agenda').select('*').eq('usuario_id', uid).order('data_compromisso')
    if (error) { avisar('Não foi possível carregar a agenda.', 'dng'); return }
    setItens((data ?? []) as Compromisso[])
  }

  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); carregar(user.id) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function irPara(delta: -1 | 1) {
    const v = mesVizinho(mes, ano, delta)
    setMes(v.mes)
    setAno(v.ano)
  }

  const lembretes = useMemo(() => lembretesProximos(itens, hoje), [itens, hoje])
  const deHoje = useMemo(() => compromissosDoDia(itens, chaveDeHoje(hoje)), [itens, hoje])
  const chaveAberta = diaAberto === null ? null : chaveDia(ano, mes, diaAberto)

  function novo(data: string) {
    setForm({ id: null, inicial: formVazio(data) })
  }

  function editar(c: Compromisso) {
    setForm({
      id: c.id,
      inicial: {
        titulo: c.titulo, descricao: c.descricao ?? '', data_compromisso: c.data_compromisso,
        hora_compromisso: horaCurta(c.hora_compromisso), status: c.status, lembrete_3_dias: c.lembrete_3_dias,
      },
    })
  }

  async function salvar(f: FormCompromisso) {
    if (!userId || !form) return
    setSalvando(true)
    const dados = payloadCompromisso(f)
    const { error } = form.id
      ? await sb.from('agenda').update(dados).eq('id', form.id)
      : await sb.from('agenda').insert({ usuario_id: userId, ...dados })
    setSalvando(false)
    if (error) { avisar('Não foi possível salvar o compromisso.', 'dng'); return }
    setForm(null)
    avisar('Compromisso salvo.', 'ok')
    await carregar(userId)
  }

  async function excluir(c: Compromisso) {
    if (!userId) return
    const ok = await confirmar({ titulo: 'Excluir compromisso?', descricao: `"${c.titulo}" sai da sua agenda.`, textoConfirmar: 'Excluir', perigo: true })
    if (!ok) return
    const { error } = await sb.from('agenda').delete().eq('id', c.id)
    if (error) { avisar('Não foi possível excluir o compromisso.', 'dng'); return }
    avisar('Compromisso excluído.', 'ok')
    await carregar(userId)
  }

  return (
    <>
      <CabecalhoPagina
        titulo={titulo}
        subtitulo={subtitulo}
        acoes={<Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => novo(chaveDeHoje(hoje))}>Novo compromisso</Button>}
      />
      {topo}
      {lembretes.length > 0 && (
        <section aria-label="Lembretes dos próximos 3 dias" className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-[18px] py-3 sm:flex-row sm:items-center sm:gap-3.5">
          <h2 className="flex flex-none items-center gap-2 text-sm font-semibold text-fg">
            <Clock size={18} aria-hidden="true" className="text-warn" />
            Lembretes · próximos 3 dias
          </h2>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {lembretes.map(item => (
              <li key={item.id} className="min-w-0 max-w-full">
                <Badge tom="warn" grande className="max-w-full overflow-hidden"><span className="truncate">{rotuloLembrete(item, hoje)}</span></Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CalendarioMes
        ano={ano}
        mes={mes}
        hoje={hoje}
        itens={itens}
        onAbrirDia={setDiaAberto}
        onMesAnterior={() => irPara(-1)}
        onProximoMes={() => irPara(1)}
        onHoje={() => { setMes(hoje.getMonth() + 1); setAno(hoje.getFullYear()) }}
      />
      <section aria-label="Compromissos de hoje" className="rounded-xl border border-line-soft bg-surface px-3.5 py-3 sm:hidden">
        <h2 className="text-sm font-semibold text-fg">{`Hoje · ${tituloDoDia(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())}`}</h2>
        {deHoje.length === 0 ? (
          <p className="mt-2 text-[13px] text-fg-3">Nenhum compromisso hoje.</p>
        ) : (
          <ul>
            {deHoje.map(item => (
              <li key={item.id} className="mt-1 flex min-h-11 items-center gap-2.5">
                <span aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', PONTO_DO_TOM[tomDoCompromisso(item, hoje)])} />
                <button type="button" onClick={() => editar(item)} className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-fg">{item.titulo}</button>
                <span className="font-mono text-[13px] text-fg-3">{horaCurta(item.hora_compromisso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {chaveAberta && diaAberto !== null && (
        <DiaModal
          key={chaveAberta}
          aberto={form === null}
          titulo={tituloDoDia(ano, mes, diaAberto)}
          ehHoje={chaveAberta === chaveDeHoje(hoje)}
          itens={compromissosDoDia(itens, chaveAberta)}
          hoje={hoje}
          onNovo={() => novo(chaveAberta)}
          onEditar={editar}
          onExcluir={excluir}
          onFechar={() => setDiaAberto(null)}
        />
      )}
      {form && (
        <CompromissoModal
          key={form.id ?? `novo-${form.inicial.data_compromisso}`}
          aberto
          inicial={form.inicial}
          editando={form.id !== null}
          salvando={salvando}
          onSalvar={salvar}
          onFechar={() => setForm(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 8: `app/(comum)/intranet/page.tsx`** — mesmas consultas de hoje; troca a renderização:

```tsx
import { Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import LinksRapidos from '@/components/fiscal/LinksRapidos'
import Agenda from '@/components/geral/agenda/Agenda'
import { Pagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'

export const metadata = { title: 'Início — Tesserato' }

export default async function IntranetPage() {
  // ...consultas IGUAIS às de hoje (user, links, settings, profile), comunicado e isAdmin...

  const avisoComunicado = comunicado ? (
    <Aviso tom="warn" icone={<Megaphone size={18} />}>
      <b>Comunicado da administração</b>
      <p className="mt-0.5 whitespace-pre-wrap">{comunicado}</p>
    </Aviso>
  ) : null

  return (
    <Pagina>
      <Agenda titulo="Início" subtitulo="Sua agenda, os avisos da equipe e os links do escritório" topo={avisoComunicado} />
      <LinksRapidos links={links ?? []} isAdmin={isAdmin} />
    </Pagina>
  )
}
```

- [ ] **Step 9: `app/fiscal/agenda/page.tsx`** (deixa de ser página cliente com cópia própria):

```tsx
import Agenda from '@/components/geral/agenda/Agenda'
import { Pagina } from '@/components/ui/Pagina'

export const metadata = { title: 'Agenda — Tesserato Fiscal' }

export default function AgendaPage() {
  return (
    <Pagina>
      <Agenda titulo="Agenda" subtitulo="Sua agenda pessoal" />
    </Pagina>
  )
}
```

- [ ] **Step 10:** `git rm components/fiscal/AgendaPessoal.tsx`; `grep -rn "AgendaPessoal" app components lib` → nada.
- [ ] **Step 11:** `npm test`, `npx tsc --noEmit`, `npx eslint components/geral/agenda "app/(comum)/intranet" app/fiscal/agenda` → limpos.
- [ ] **Step 12: Commit**

```bash
git add -A components/geral/agenda components/fiscal/AgendaPessoal.tsx "app/(comum)/intranet/page.tsx" app/fiscal/agenda/page.tsx tests/agenda-calendario.test.ts
git commit -m "feat(inicio): agenda única no Início e em /fiscal/agenda, no desenho novo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Links úteis

Pranchetas `g-03-inicio` (cartões) e `m-19-links` (edição). Visual: grade de cartões com a inicial, nome, domínio e ícone de link externo. Edição (só admin): cada link com Nome/Endereço e Excluir; cartão tracejado para adicionar; aviso de "alterações não salvas"; **um único "Concluir edição" que valida e salva tudo**.

**Files:**
- Create: `lib/links-uteis.ts`, `components/geral/LinksUteis.tsx`
- Modify: `app/(comum)/intranet/page.tsx` (trocar `LinksRapidos` por `LinksUteis`)
- Delete: `components/fiscal/LinksRapidos.tsx`
- Test: `tests/links-uteis.test.ts`

**Interfaces:**
- Consumes: `criarLink(titulo, url)`, `atualizarLink(id, titulo, url)` → `{ error: string | null }`; `excluirLink(id)` → `void` (de `app/(comum)/intranet/actions.ts`, sem mudança). `LinkRapido` de `lib/types`.
- Produces: `hrefDoLink(url)`, `dominioDoLink(url)`, `inicialDoLink(titulo)`, `validarLink(titulo, url): ErrosLink`, `temErro(e)`, `linksAlterados(links, edicoes)`, `linksAtivos(links)`; tipos `EdicaoLink`, `ErrosLink`. Componente `LinksUteis({ links, isAdmin })` (default export).

- [ ] **Step 1: Teste que falha** — `tests/links-uteis.test.ts`:

```ts
// tests/links-uteis.test.ts — regras dos links úteis do Início.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hrefDoLink, dominioDoLink, inicialDoLink, validarLink, temErro, linksAlterados, linksAtivos } from '../lib/links-uteis'
import type { LinkRapido } from '../lib/types'

const link = (id: string, titulo: string, url: string, ordem: number, ativo = true): LinkRapido => ({ id, titulo, url, ordem, ativo, logo_url: null })

test('endereço sem protocolo abre como https', () => {
  assert.equal(hrefDoLink('www.gclick.com.br'), 'https://www.gclick.com.br')
  assert.equal(hrefDoLink(' http://iob.com.br '), 'http://iob.com.br')
  assert.equal(dominioDoLink('https://cav.receita.fazenda.gov.br/x'), 'cav.receita.fazenda.gov.br')
  assert.equal(dominioDoLink('nada válido'), '')
  assert.equal(inicialDoLink(' nutror'), 'N')
  assert.equal(inicialDoLink(''), '?')
})

test('validação: nome e endereço obrigatórios; endereço precisa de domínio completo', () => {
  assert.deepEqual(validarLink('', ''), { titulo: 'Informe o nome.', url: 'Informe o endereço.' })
  assert.deepEqual(validarLink('Nutror', 'www.nutror'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('X', 'https://'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('X', 'localhost:3000'), { url: 'Endereço incompleto' })
  assert.deepEqual(validarLink('GClick', 'https://www.gclick.com.br'), {})
  assert.deepEqual(validarLink('Webmail', 'webmail.tesseratocontabilidade.com.br'), {})
  assert.equal(temErro({}), false)
  assert.equal(temErro({ url: 'x' }), true)
})

test('alterados: só o que difere do salvo, sem contar espaços nas pontas', () => {
  const links = [link('a', 'CAV', 'https://cav.gov.br', 0), link('b', 'IOB', 'https://iob.com.br', 1), link('c', 'GClick', 'https://gclick.com.br', 2)]
  const r = linksAlterados(links, {
    a: { titulo: ' CAV ', url: 'https://cav.gov.br' },
    b: { titulo: 'IOB Online', url: 'https://iob.com.br ' },
  })
  assert.deepEqual(r, [{ id: 'b', titulo: 'IOB Online', url: 'https://iob.com.br' }])
})

test('vários editados e um inválido: a validação acha só o errado', () => {
  const links = [link('a', 'A', 'https://a.com.br', 0), link('b', 'B', 'https://b.com.br', 1)]
  const alterados = linksAlterados(links, { a: { titulo: 'A2', url: 'https://a.com.br' }, b: { titulo: 'B', url: 'www.b' } })
  const comErro = alterados.filter(p => temErro(validarLink(p.titulo, p.url))).map(p => p.id)
  assert.deepEqual(comErro, ['b'])
})

test('ativos em ordem', () => {
  const r = linksAtivos([link('b', 'B', 'b.com', 2), link('x', 'X', 'x.com', 0, false), link('a', 'A', 'a.com', 1)])
  assert.deepEqual(r.map(l => l.id), ['a', 'b'])
})
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: `lib/links-uteis.ts`**

```ts
// lib/links-uteis.ts — regras dos links úteis do Início (funções puras).
import type { LinkRapido } from './types'

export interface EdicaoLink { titulo: string; url: string }
export interface ErrosLink { titulo?: string; url?: string }

/** Endereço salvo sem protocolo ("www.site.com.br") abriria como caminho do portal; vira https. */
export function hrefDoLink(url: string): string {
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function dominioDoLink(url: string): string {
  try { return new URL(hrefDoLink(url)).hostname } catch { return '' }
}

export function inicialDoLink(titulo: string): string {
  return titulo.trim().charAt(0).toUpperCase() || '?'
}

function enderecoCompleto(url: string): boolean {
  let host: string
  try { host = new URL(hrefDoLink(url)).hostname } catch { return false }
  const partes = host.replace(/^www\./i, '').split('.')
  return partes.length >= 2 && partes.every(Boolean) && /^[a-z]{2,}$/i.test(partes[partes.length - 1])
}

export function validarLink(titulo: string, url: string): ErrosLink {
  const erros: ErrosLink = {}
  if (!titulo.trim()) erros.titulo = 'Informe o nome.'
  if (!url.trim()) erros.url = 'Informe o endereço.'
  else if (!enderecoCompleto(url)) erros.url = 'Endereço incompleto'
  return erros
}

export function temErro(e: ErrosLink): boolean {
  return Boolean(e.titulo || e.url)
}

/** Só os links cuja edição difere do que está salvo (sem contar espaços nas pontas). */
export function linksAlterados(links: LinkRapido[], edicoes: Record<string, EdicaoLink>): (EdicaoLink & { id: string })[] {
  return links.flatMap(l => {
    const e = edicoes[l.id]
    if (!e) return []
    const titulo = e.titulo.trim()
    const url = e.url.trim()
    return titulo === l.titulo && url === l.url ? [] : [{ id: l.id, titulo, url }]
  })
}

export function linksAtivos(links: LinkRapido[]): LinkRapido[] {
  return links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)
}
```

- [ ] **Step 4:** teste passa.

- [ ] **Step 5: `components/geral/LinksUteis.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LinkRapido } from '@/lib/types'
import { criarLink, atualizarLink, excluirLink } from '@/app/(comum)/intranet/actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  dominioDoLink, hrefDoLink, inicialDoLink, linksAlterados, linksAtivos, temErro, validarLink,
  type EdicaoLink, type ErrosLink,
} from '@/lib/links-uteis'

const contar = (n: number) => (n === 1 ? '1 link' : `${n} links`)

export default function LinksUteis({ links, isAdmin }: { links: LinkRapido[]; isAdmin: boolean }) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [ocupado, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const [edicoes, setEdicoes] = useState<Record<string, EdicaoLink>>({})
  const [erros, setErros] = useState<Record<string, ErrosLink>>({})
  const [novo, setNovo] = useState<EdicaoLink>({ titulo: '', url: '' })
  const [erroNovo, setErroNovo] = useState<ErrosLink>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const ativos = linksAtivos(links)
  const pendentes = linksAlterados(ativos, edicoes)
  const valor = (l: LinkRapido): EdicaoLink => edicoes[l.id] ?? { titulo: l.titulo, url: l.url }

  function editar(l: LinkRapido, campo: keyof EdicaoLink, v: string) {
    setEdicoes(p => ({ ...p, [l.id]: { ...valor(l), [campo]: v } }))
    setErros(p => { const { [l.id]: _removido, ...resto } = p; return resto })
  }

  function sairDaEdicao() {
    setEditando(false)
    setEdicoes({})
    setErros({})
    setNovo({ titulo: '', url: '' })
    setErroNovo({})
    setErroGeral(null)
  }

  function concluir() {
    const novosErros: Record<string, ErrosLink> = {}
    for (const p of pendentes) {
      const e = validarLink(p.titulo, p.url)
      if (temErro(e)) novosErros[p.id] = e
    }
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return
    if (pendentes.length === 0) { sairDaEdicao(); return }
    setErroGeral(null)
    iniciar(async () => {
      const falhas: string[] = []
      for (const p of pendentes) {
        const r = await atualizarLink(p.id, p.titulo, p.url)
        if (r.error) falhas.push(p.id)
      }
      router.refresh()
      if (falhas.length > 0) {
        setEdicoes(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => falhas.includes(id))))
        setErroGeral(`Não foi possível salvar ${contar(falhas.length)}. Tente de novo.`)
        return
      }
      avisar(pendentes.length === 1 ? 'Link salvo.' : `${pendentes.length} links salvos.`, 'ok')
      sairDaEdicao()
    })
  }

  async function excluir(l: LinkRapido) {
    const ok = await confirmar({ titulo: 'Excluir link?', descricao: `"${l.titulo}" sai dos links úteis de todos.`, textoConfirmar: 'Excluir', perigo: true })
    if (!ok) return
    iniciar(async () => {
      await excluirLink(l.id)
      setEdicoes(p => { const { [l.id]: _removido, ...resto } = p; return resto })
      avisar('Link excluído.', 'ok')
      router.refresh()
    })
  }

  function adicionar() {
    const e = validarLink(novo.titulo, novo.url)
    setErroNovo(e)
    if (temErro(e)) return
    iniciar(async () => {
      const r = await criarLink(novo.titulo.trim(), novo.url.trim())
      if (r.error) { setErroGeral(r.error); return }
      setNovo({ titulo: '', url: '' })
      avisar('Link adicionado.', 'ok')
      router.refresh()
    })
  }

  const acoes = !isAdmin ? undefined : editando ? (
    <>
      {pendentes.length > 0 && <Button variante="fantasma" tamanho="p" onClick={sairDaEdicao} disabled={ocupado}>Descartar</Button>}
      <Button tamanho="p" icone={<Check size={14} aria-hidden="true" />} onClick={concluir} carregando={ocupado}>Concluir edição</Button>
    </>
  ) : (
    <Button variante="fantasma" tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditando(true)}>Editar links</Button>
  )

  return (
    <Card titulo="Links úteis" meta={<Badge>{ativos.length}</Badge>} acoes={acoes} semPadding>
      {editando ? (
        <div className="flex flex-col gap-3 p-4">
          {pendentes.length > 0 && (
            <Aviso tom="warn"><b>Alterações não salvas: {contar(pendentes.length)}.</b> “Concluir edição” salva tudo junto.</Aviso>
          )}
          {erroGeral && <div role="alert"><Aviso tom="dng">{erroGeral}</Aviso></div>}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ativos.map(l => {
              const v = valor(l)
              const e = erros[l.id] ?? {}
              return (
                <li key={l.id} className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-page p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field rotulo="Nome" erro={e.titulo}>
                      {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} value={v.titulo} onChange={ev => editar(l, 'titulo', ev.target.value)} />}
                    </Field>
                    <Field rotulo="Endereço" erro={e.url}>
                      {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} inputMode="url" value={v.url} onChange={ev => editar(l, 'url', ev.target.value)} />}
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button tamanho="p" variante="perigo" icone={<Trash2 size={14} aria-hidden="true" />} onClick={() => excluir(l)} disabled={ocupado}>Excluir</Button>
                  </div>
                </li>
              )
            })}
            <li className="flex flex-col gap-2.5 rounded-xl border border-dashed border-line p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field rotulo="Nome" erro={erroNovo.titulo}>
                  {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} placeholder="Ex.: Portal da Prefeitura" value={novo.titulo} onChange={ev => setNovo(p => ({ ...p, titulo: ev.target.value }))} />}
                </Field>
                <Field rotulo="Endereço" erro={erroNovo.url}>
                  {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} inputMode="url" placeholder="https://" value={novo.url} onChange={ev => setNovo(p => ({ ...p, url: ev.target.value }))} />}
                </Field>
              </div>
              <div className="flex justify-end">
                <Button tamanho="p" icone={<Plus size={14} aria-hidden="true" />} onClick={adicionar} disabled={ocupado}>Adicionar link</Button>
              </div>
            </li>
          </ul>
        </div>
      ) : ativos.length === 0 ? (
        <EmptyState
          icone={<Link2 size={24} />}
          titulo="Nenhum link cadastrado"
          descricao={isAdmin ? 'Use “Editar links” para adicionar os sites do escritório.' : 'A administração ainda não cadastrou links.'}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {ativos.map(l => (
            <li key={l.id} className="min-w-0">
              <a
                href={hrefDoLink(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-3 rounded-[10px] border border-line-soft bg-page px-3 py-2.5 transition-colors hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-acc-soft font-bold text-acc-text">{inicialDoLink(l.titulo)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-snug text-fg group-hover:text-acc-text">{l.titulo}</span>
                  <span className="block truncate text-xs text-fg-3">{dominioDoLink(l.url)}</span>
                </span>
                <ExternalLink size={14} aria-hidden="true" className="flex-none text-fg-3" />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```

- [ ] **Step 6:** No Início: `import LinksUteis from '@/components/geral/LinksUteis'` e `<LinksUteis links={links ?? []} isAdmin={isAdmin} />` no lugar de `LinksRapidos`. `git rm components/fiscal/LinksRapidos.tsx`; `grep -rn "LinksRapidos" app components` → nada.
- [ ] **Step 7:** `npm test`, `npx tsc --noEmit`, `npx eslint components/geral/LinksUteis.tsx lib/links-uteis.ts "app/(comum)/intranet"` → limpos.
- [ ] **Step 8: Commit**

```bash
git add -A lib/links-uteis.ts tests/links-uteis.test.ts components/geral/LinksUteis.tsx components/fiscal/LinksRapidos.tsx "app/(comum)/intranet/page.tsx"
git commit -m "feat(inicio): links úteis no desenho novo, edição salva tudo de uma vez" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Cadastro de clientes — lista

Prancheta `g-05-cadastro`. Cabeçalho "Cadastro de clientes" com contagem, Imprimir e Novo cliente; filtros Buscar, Regime, **Setor** (novo), Atividade (chips); tabela Razão social (nome + CNPJ empilhados, ordenável), Regime (selo, ordenável), Atividade, **Setores** (selos), ação Abrir. Endereço sai da tela e vira coluna **Município só na impressão**.

**Files:**
- Create: `lib/clientes-geral.ts`
- Modify (reescrever a renderização): `components/geral/ClientesGeralLista.tsx`, `app/(comum)/clientes/page.tsx`
- Test: `tests/clientes-geral.test.ts`

**Interfaces:**
- Consumes: `Pagina`, `CabecalhoPagina`, `Chip` (Task 1); `NomeCliente`, `Tabela`/`Th`/`Td`, `Badge`, `Card`, `EmptyState`, `Field`, `Input`, `Select`, `Button`, `IconButton`; `useFiltroPersistente`; `empresaDesabilitada` de `lib/cliente-ativo`.
- Produces: `SETORES_DE_CLIENTE: UserSetor[]` (todos menos `configuracoes`), `TODOS = 'TODOS'`, `filtrarClientesGeral(lista, filtros, ordem)`, `proximaOrdenacao(atual, campo)`, `ariaSort(ordem, campo)`, `setoresDoCliente(setores)`; tipos `FiltrosClientesGeral`, `Ordenacao`, `CampoOrdem`, `ClienteGeralLinha`. (Task 7 e Task 9 usam `SETORES_DE_CLIENTE`.)

- [ ] **Step 1: Teste que falha** — `tests/clientes-geral.test.ts`:

```ts
// tests/clientes-geral.test.ts — filtros e ordem do Cadastro de clientes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SETORES_DE_CLIENTE, TODOS, filtrarClientesGeral, proximaOrdenacao, ariaSort, setoresDoCliente,
  type ClienteGeralLinha, type FiltrosClientesGeral,
} from '../lib/clientes-geral'

const cli = (nome: string, extra: Partial<ClienteGeralLinha> = {}): ClienteGeralLinha => ({
  nome, cnpj: null, setores: ['fiscal'], clientes_fiscal: { regime: null, atividade: [] }, ...extra,
})
const lista = [
  cli('Comércio São José LTDA', { cnpj: '12.345.678/0001-90', setores: ['fiscal', 'contabil'], clientes_fiscal: { regime: 'Simples Nacional', atividade: ['Comércio'] } }),
  cli('Alfa Serviços', { setores: ['societario', 'financeiro'], clientes_fiscal: null }),
  cli('Beta Indústria', { cnpj: '98765432000110', clientes_fiscal: { regime: 'Lucro Presumido', atividade: ['Indústria', 'Serviço'] } }),
]
const f = (extra: Partial<FiltrosClientesGeral> = {}): FiltrosClientesGeral => ({ busca: '', regime: TODOS, setor: TODOS, atividades: [], ...extra })
const nomes = (r: ClienteGeralLinha[]) => r.map(c => c.nome)

test('setores de cliente não incluem Configurações', () => {
  assert.deepEqual(SETORES_DE_CLIENTE, ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'])
  assert.deepEqual(setoresDoCliente(['financeiro', 'configuracoes', 'fiscal']), ['fiscal', 'financeiro'])
  assert.deepEqual(setoresDoCliente(null), [])
})

test('busca por nome ignora acento e maiúscula', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: 'sao jose' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: 'SERVIÇOS' }), null)), ['Alfa Serviços'])
})

test('busca por CNPJ com ou sem pontuação', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '12.345' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '12345678' }), null)), ['Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ busca: '98.765.432/0001-10' }), null)), ['Beta Indústria'])
})

test('filtros de regime, setor e atividade', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ regime: 'Lucro Presumido' }), null)), ['Beta Indústria'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ setor: 'financeiro' }), null)), ['Alfa Serviços'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f({ atividades: ['Serviço', 'Comércio'] }), null)), ['Comércio São José LTDA', 'Beta Indústria'])
})

test('ordem por nome e por regime (sem regime primeiro no crescente)', () => {
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'nome', direcao: 'asc' })), ['Alfa Serviços', 'Beta Indústria', 'Comércio São José LTDA'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'nome', direcao: 'desc' })), ['Comércio São José LTDA', 'Beta Indústria', 'Alfa Serviços'])
  assert.deepEqual(nomes(filtrarClientesGeral(lista, f(), { campo: 'regime', direcao: 'asc' })), ['Alfa Serviços', 'Beta Indústria', 'Comércio São José LTDA'])
})

test('ciclo da ordenação e aria-sort', () => {
  const a = proximaOrdenacao(null, 'nome')
  assert.deepEqual(a, { campo: 'nome', direcao: 'asc' })
  const b = proximaOrdenacao(a, 'nome')
  assert.deepEqual(b, { campo: 'nome', direcao: 'desc' })
  assert.equal(proximaOrdenacao(b, 'nome'), null)
  assert.deepEqual(proximaOrdenacao(b, 'regime'), { campo: 'regime', direcao: 'asc' })
  assert.equal(ariaSort(a, 'nome'), 'ascending')
  assert.equal(ariaSort(b, 'nome'), 'descending')
  assert.equal(ariaSort(a, 'regime'), 'none')
})
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: `lib/clientes-geral.ts`**

```ts
// lib/clientes-geral.ts — filtros e ordem do Cadastro de clientes (tela geral).
import { SETORES, type UserSetor } from './types'

/** Setores em que um cliente pode aparecer ("Configurações" é setor de usuário, não de cliente). */
export const SETORES_DE_CLIENTE: UserSetor[] = SETORES.filter(s => s !== 'configuracoes')
export const TODOS = 'TODOS'

export interface ClienteGeralLinha {
  nome: string
  cnpj: string | null
  setores: UserSetor[] | null
  clientes_fiscal: { regime: string | null; atividade: string[] | null } | null
}
export interface FiltrosClientesGeral { busca: string; regime: string; setor: string; atividades: string[] }
export type CampoOrdem = 'nome' | 'regime'
export type Ordenacao = { campo: CampoOrdem; direcao: 'asc' | 'desc' } | null

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const soDigitos = (s: string) => s.replace(/\D/g, '')

export function filtrarClientesGeral<T extends ClienteGeralLinha>(lista: T[], f: FiltrosClientesGeral, ordem: Ordenacao): T[] {
  const termo = semAcento(f.busca.trim())
  const digitos = soDigitos(f.busca)
  const filtrados = lista.filter(c => {
    if (termo) {
      const noNome = semAcento(c.nome).includes(termo)
      const noCnpj = digitos.length > 0 && soDigitos(c.cnpj ?? '').includes(digitos)
      if (!noNome && !noCnpj) return false
    }
    if (f.regime !== TODOS && c.clientes_fiscal?.regime !== f.regime) return false
    if (f.setor !== TODOS && !(c.setores ?? []).includes(f.setor as UserSetor)) return false
    if (f.atividades.length > 0 && !f.atividades.some(a => (c.clientes_fiscal?.atividade ?? []).includes(a))) return false
    return true
  })
  if (!ordem) return filtrados
  const chave = (c: T) => semAcento(ordem.campo === 'nome' ? c.nome : c.clientes_fiscal?.regime ?? '')
  return [...filtrados].sort((a, b) => {
    const r = chave(a).localeCompare(chave(b), 'pt-BR')
    return ordem.direcao === 'asc' ? r : -r
  })
}

/** Crescente → decrescente → sem ordem. */
export function proximaOrdenacao(atual: Ordenacao, campo: CampoOrdem): Ordenacao {
  if (atual?.campo !== campo) return { campo, direcao: 'asc' }
  return atual.direcao === 'asc' ? { campo, direcao: 'desc' } : null
}

export function ariaSort(ordem: Ordenacao, campo: CampoOrdem): 'ascending' | 'descending' | 'none' {
  if (ordem?.campo !== campo) return 'none'
  return ordem.direcao === 'asc' ? 'ascending' : 'descending'
}

export function setoresDoCliente(setores: UserSetor[] | null): UserSetor[] {
  return SETORES_DE_CLIENTE.filter(s => (setores ?? []).includes(s))
}
```

- [ ] **Step 4:** teste passa.

- [ ] **Step 5: `components/geral/ClientesGeralLista.tsx`** — mesmas props, mesmos estados de janela (`modalNovoOpen`, `clienteAbertoId`) e as duas `ClienteGeralModal` no fim **iguais** às de hoje. Troca o resto:
  - remover `CORES_REGIME`, `corRegime`, `iconeOrdenacao`, `selectClass` e o `useMemo` antigo;
  - novo filtro persistente `const [filtroSetor, setFiltroSetor] = useFiltroPersistente('clientesGeral:setor', TODOS)`; `ordenacao` passa a ser `useState<Ordenacao>(null)`;
  - `const filtrados = useMemo(() => filtrarClientesGeral(clientes, { busca, regime: filtroRegime, setor: filtroSetor, atividades: filtroAtividade }, ordenacao), [clientes, busca, filtroRegime, filtroSetor, filtroAtividade, ordenacao])`.

Renderização:

```tsx
  const total = clientes.length
  const subtitulo = filtrados.length === total
    ? `${total} ${total === 1 ? 'cliente' : 'clientes'} · todos os setores`
    : `${filtrados.length} de ${total} clientes · todos os setores`

  const thOrdenavel = (campo: CampoOrdem, rotulo: string, largura?: number) => (
    <Th largura={largura} aria-sort={ariaSort(ordenacao, campo)}>
      <button
        type="button"
        onClick={() => setOrdenacao(o => proximaOrdenacao(o, campo))}
        className="inline-flex items-center gap-1.5 rounded uppercase hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {rotulo}
        {ordenacao?.campo !== campo
          ? <ArrowUpDown size={14} aria-hidden="true" />
          : ordenacao.direcao === 'asc'
            ? <ArrowUp size={14} aria-hidden="true" className="text-acc-text" />
            : <ArrowDown size={14} aria-hidden="true" className="text-acc-text" />}
      </button>
    </Th>
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Cadastro de clientes"
        subtitulo={subtitulo}
        acoes={
          <>
            <Button icone={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Imprimir</Button>
            {podeCriar && <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Regime" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {catalogoFiscal.regimes.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Setor" className="w-full sm:w-[170px]">
          {c => (
            <Select id={c.id} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {SETORES_DE_CLIENTE.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        {catalogoFiscal.atividades.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-atividade" className="text-[13px] font-medium text-fg-2">Atividade</span>
            <div role="group" aria-labelledby="rotulo-filtro-atividade" className="flex flex-wrap gap-2">
              {catalogoFiscal.atividades.map(nome => (
                <Chip key={nome} ativo={filtroAtividade.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card semPadding className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca ou os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela className="min-w-[760px]">
              <thead>
                <tr>
                  {thOrdenavel('nome', 'Razão social')}
                  {thOrdenavel('regime', 'Regime', 170)}
                  <Th largura={150}>Atividade</Th>
                  <Th>Setores</Th>
                  <Th largura={160} className="hidden print:table-cell">Município</Th>
                  <Th largura={56} className="print:hidden"><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const desabilitado = empresaDesabilitada([c.clientes_fiscal, c.clientes_contabil, c.clientes_pessoal])
                  const regime = c.clientes_fiscal?.regime
                  const atividades = c.clientes_fiscal?.atividade ?? []
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <button type="button" onClick={() => setClienteAbertoId(c.id)} className="block w-full min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente nome={c.nome} cnpj={c.cnpj} depoisDoNome={desabilitado ? <Badge tom="warn">Desabilitado</Badge> : undefined} />
                        </button>
                      </Td>
                      <Td>
                        {regime
                          ? <Badge tom="acc" className="max-w-full overflow-hidden"><span className="truncate" title={regime}>{regime.split('/')[0].trim()}</span></Badge>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{atividades.length > 0 ? atividades.join(', ') : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {setoresDoCliente(c.setores).map(s => <Badge key={s}>{SETOR_LABEL[s]}</Badge>)}
                        </div>
                      </Td>
                      <Td className="hidden text-fg-2 print:table-cell">{[c.municipio, c.uf].filter(Boolean).join('/') || '—'}</Td>
                      <Td alinhar="dir" className="print:hidden">
                        <IconButton
                          rotulo={`${isAdmin ? 'Editar' : 'Ver'} ${c.nome}`}
                          icone={isAdmin ? <Pencil size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                          onClick={() => setClienteAbertoId(c.id)}
                        />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      {/* as duas <ClienteGeralModal> de hoje, sem mudança */}
    </Pagina>
  )
```

Imports novos: `ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Printer, Search, Users` de `lucide-react`; `SETOR_LABEL` de `@/lib/types`; `Pagina, CabecalhoPagina` de `@/components/ui/Pagina`; `Chip`; `Button, IconButton`; `Badge`; `Card`; `EmptyState`; `Field`; `Input, Select`; `NomeCliente`; `Tabela, Th, Td`; e de `@/lib/clientes-geral`: `SETORES_DE_CLIENTE, TODOS, filtrarClientesGeral, proximaOrdenacao, ariaSort, setoresDoCliente, type Ordenacao, type CampoOrdem`. O `h1` "print-only" antigo sai (o `CabecalhoPagina` já imprime; os botões dele têm `print:hidden`). Os `no-print` antigos saem (substituídos por `print:hidden`).

- [ ] **Step 6: `app/(comum)/clientes/page.tsx`** — `metadata = { title: 'Cadastro de clientes — Tesserato' }` e `return <ClientesGeralLista … />` **sem** o `<div className="p-8">` (a lista já usa `Pagina`).
- [ ] **Step 7:** `npm test`, `npx tsc --noEmit`, `npx eslint components/geral/ClientesGeralLista.tsx lib/clientes-geral.ts "app/(comum)/clientes"` → limpos.
- [ ] **Step 8: Commit**

```bash
git add lib/clientes-geral.ts tests/clientes-geral.test.ts components/geral/ClientesGeralLista.tsx "app/(comum)/clientes/page.tsx"
git commit -m "feat(cadastro): lista de clientes no desenho novo, com filtro por setor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Janela do cliente e as janelas que abrem por cima dela

Pranchetas `m-02-cliente-geral`, `m-03-excluir-cliente`, `m-04-desabilitar`, `m-05-tipo-tarefa`. A janela do cliente vai para `Modal` (z-70, foco preso). Toda janela que abre **por cima** dela precisa estar no mesmo `Modal`, senão fica atrás (as antigas usam `z-50`/`z-[60]`) e o foco preso da de baixo rouba o Tab: `ConfirmarExclusaoClienteModal`, `DesabilitarClienteModal` e `NovoTipoTarefaModal` migram agora. `GruposTarefasModal` não abre a partir daqui (só com `isEdit && !readOnly` no `CamposFiscais`, e aqui o Fiscal é só leitura na edição) — fica para a Fase 4. `CamposFiscais` não muda (Fase 4).

**Files:**
- Modify: `components/geral/ClienteGeralModal.tsx`, `components/geral/ConfirmarExclusaoClienteModal.tsx`, `components/geral/DesabilitarClienteModal.tsx`, `components/geral/NovoTipoTarefaModal.tsx`, `components/geral/SectorSection.tsx`
- Test: `tests/cliente-geral-janelas.test.ts`

**Interfaces:**
- Consumes: `SETORES_DE_CLIENTE` (Task 6), `Chip` (Task 1), `Modal`, `Button`, `IconButton`, `Field`, `Input`, `Select`, `Checkbox`, `Switch`, `Aviso`, `useConfirmar`, `cn`.
- Produces: as quatro janelas com **as mesmas props de hoje** (nenhum chamador muda: `ClienteAcoes`, `ClienteContabilAcoes`, `ClientePessoalAcoes`, `EmpresaModal`, `EmpresaContabilModal`, `EmpresaPessoalModal`, `TarefasTab`, `TarefasSocietarioTab`, `TarefasFinanceiroTab`). Elas continuam montadas só quando abertas (o chamador faz `{aberto && <X/>}`), então passam `aberto` fixo `true` para o `Modal`.

- [ ] **Step 1: Teste que falha** — `tests/cliente-geral-janelas.test.ts`:

```ts
// tests/cliente-geral-janelas.test.ts — janelas do cadastro de cliente no Modal comum.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ConfirmarExclusaoClienteModal from '../components/geral/ConfirmarExclusaoClienteModal'
import DesabilitarClienteModal from '../components/geral/DesabilitarClienteModal'
import SectorSection from '../components/geral/SectorSection'
import { descreverImpactoExclusao } from '../lib/exclusao-cliente'

const ROOT = join(__dirname, '..')
const nada = () => {}
const assincrono = async () => ({ error: null })

test('as janelas que abrem por cima da janela de cliente usam o Modal comum', () => {
  for (const arq of ['ClienteGeralModal', 'ConfirmarExclusaoClienteModal', 'DesabilitarClienteModal', 'NovoTipoTarefaModal']) {
    const fonte = readFileSync(join(ROOT, 'components', 'geral', `${arq}.tsx`), 'utf8')
    assert.match(fonte, /from '@\/components\/ui\/Modal'/, arq)
    assert.doesNotMatch(fonte, /fixed inset-0/, arq)
    assert.doesNotMatch(fonte, /\bconfirm\(/, arq)
  }
})

test('excluir do sistema: pede nome e DELETAR, botão começa desabilitado', () => {
  const impacto = descreverImpactoExclusao({ origem: 'geral', acao: 'excluir-do-sistema', setoresDoCliente: ['fiscal'] })
  const html = renderToStaticMarkup(h(ConfirmarExclusaoClienteModal, { nomeCliente: 'Empresa Teste', impacto, onConfirmar: assincrono, onCancelar: nada }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /Empresa Teste/)
  assert.match(html, /DELETAR/)
  const botao = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${impacto.rotuloBotao}`))?.[0] ?? ''
  assert.match(botao, /disabled=""/)
})

test('desabilitar: nome e senha de login, senha oculta, botão desabilitado', () => {
  const html = renderToStaticMarkup(h(DesabilitarClienteModal, { clienteNome: 'Empresa Teste', onClose: nada, onConfirm: async () => ({}), onConfirmado: nada }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /type="password"/)
  const botao = html.match(/<button[^>]*>(?:(?!<\/button>).)*Desabilitar cliente/)?.[0] ?? ''
  assert.match(botao, /disabled=""/)
})

test('seção recolhível: fechada por padrão, com aria-expanded', () => {
  const html = renderToStaticMarkup(h(SectorSection, { title: 'Dados do Fiscal', note: 'somente leitura', children: h('p', null, 'CONTEUDO') }))
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /CONTEUDO/)
})
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: `ConfirmarExclusaoClienteModal.tsx`** — mesma lógica (estados, `valido`, `confirmar()`); trocar a renderização:

```tsx
  return (
    <Modal
      aberto
      onFechar={onCancelar}
      bloqueado={executando}
      titulo={impacto.titulo}
      subtitulo={nomeCliente}
      largura="p"
      icone={<span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-danger-soft text-danger"><Trash2 size={20} /></span>}
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancelar} disabled={executando} className="ml-auto">Cancelar</Button>
          <Button variante="perigo-solido" onClick={confirmar} disabled={!valido} carregando={executando}>
            {executando ? 'Excluindo…' : impacto.rotuloBotao}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-fg-2">
        <p>{impacto.descricao}</p>
        <ul className="list-disc space-y-1 pl-5">{impacto.detalhes.map(d => <li key={d}>{d}</li>)}</ul>
      </div>
      <Aviso tom="info">{AVISO_RESTAURACAO}</Aviso>
      <Field rotulo={<>Digite o nome do cliente: <b className="font-semibold text-fg">{nomeCliente}</b></>}>
        {c => <Input id={c.id} data-autofocus autoComplete="off" value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />}
      </Field>
      {impacto.exigeDeletar && (
        <Field rotulo="Digite DELETAR para confirmar">
          {c => <Input id={c.id} autoComplete="off" placeholder="DELETAR" value={palavraDigitada} onChange={e => setPalavraDigitada(e.target.value)} />}
        </Field>
      )}
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
```

Imports: `Trash2` (lucide), `Modal`, `Button`, `Field`, `Input`, `Aviso`.

- [ ] **Step 4: `DesabilitarClienteModal.tsx`** — mesma lógica (nome exato + senha, `onConfirm(senha)`, `onConfirmado()` + `onClose()`); renderização:

```tsx
  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={enviando}
      titulo="Desabilitar cliente"
      subtitulo={clienteNome}
      largura="p"
      icone={<span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-warn-soft text-warn"><Lock size={20} /></span>}
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose} disabled={enviando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" onClick={handleConfirmar} disabled={!confirmacaoValida} carregando={enviando}>
            {enviando ? 'Desabilitando…' : 'Desabilitar cliente'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-2">O cliente sai das listas e das contagens do mês. O histórico continua intacto e você pode reabilitar quando quiser.</p>
      <Field rotulo={<>Digite o nome do cliente: <b className="font-semibold text-fg">{clienteNome}</b></>}>
        {c => <Input id={c.id} data-autofocus autoComplete="off" value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />}
      </Field>
      <Field rotulo="Sua senha de login">
        {c => <Input id={c.id} type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />}
      </Field>
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
```

- [ ] **Step 5: `NovoTipoTarefaModal.tsx`** — mesma lógica (formatos, etapas, periodicidade, `criarTipoTarefa`); renderização:

```tsx
  return (
    <Modal
      aberto
      onFechar={onCancel}
      bloqueado={salvando}
      titulo="Novo tipo de tarefa"
      subtitulo={`"${nome}" ainda não existe no catálogo`}
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancel} disabled={salvando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" onClick={handleCriar} disabled={temEtapas && etapas.length === 0} carregando={salvando}>
            {salvando ? 'Criando…' : 'Criar tipo'}
          </Button>
        </>
      }
    >
      {(setor === 'societario' || setor === 'financeiro') && (
        <Field rotulo="Periodicidade">
          {c => (
            <Select id={c.id} value={periodicidade} onChange={e => setPeriodicidade(e.target.value as Periodicidade)}>
              {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          )}
        </Field>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Formato de resposta</legend>
        {FORMATOS.map(f => {
          const ativo = formato === f.value
          return (
            <label key={f.value} className={cn('flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3', ativo ? 'border-acc bg-acc-soft' : 'border-line-soft')}>
              <input type="radio" name="formato" checked={ativo} onChange={() => setFormato(f.value)} className="mt-0.5 h-[18px] w-[18px] accent-[var(--acc)]" />
              <span>
                <span className="block text-sm font-semibold text-fg">{f.label}</span>
                <span className="block text-[13px] text-fg-3">{f.desc}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {temEtapas && (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-line-soft p-3.5">
          <span className="text-[13px] font-medium text-fg-2">{formato === 'checklist' ? 'Opções' : 'Etapas'} ({etapas.length})</span>
          {etapas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {etapas.map((e, i) => (
                <li key={i} className="inline-flex h-[30px] items-center gap-1 rounded-full border border-line bg-acc-soft pl-3 pr-1 text-[13px] text-fg">
                  {e}
                  <IconButton rotulo={`Remover ${e}`} icone={<X size={14} aria-hidden="true" />} onClick={() => setEtapas(prev => prev.filter((_, idx) => idx !== i))} className="h-6 w-6" />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input aria-label={formato === 'checklist' ? 'Nova opção' : 'Nova etapa'} value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEtapa() } }} placeholder="Digite e tecle Enter" />
            <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addEtapa}>Adicionar</Button>
          </div>
        </div>
      )}
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
```

Remover `inputCls`/`labelCls`. Imports: `Plus, X` (lucide), `Modal`, `Button, IconButton`, `Field`, `Input, Select`, `Aviso`, `cn`.

- [ ] **Step 6: `SectorSection.tsx`**

```tsx
'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/components/ui/cn'

interface SectorSectionProps {
  title: string
  note?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

// Bloco recolhível dentro de janelas (ex.: "Dados do Fiscal" na janela de cliente).
export default function SectorSection({ title, note, defaultOpen = false, children }: SectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className="overflow-hidden rounded-[10px] border border-line-soft">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className="flex w-full flex-wrap items-center gap-x-2 px-3.5 py-3 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
      >
        <ChevronDown size={16} aria-hidden="true" className={cn('flex-none text-fg-3 transition-transform', !open && '-rotate-90')} />
        <span className="text-sm font-semibold text-fg">{title}</span>
        {note && <span className="text-[13px] text-fg-3">· {note}</span>}
      </button>
      {open && <div id={id} className="flex flex-col gap-5 px-3.5 pb-4 pt-1">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 7: `ClienteGeralModal.tsx`** — mesma lógica de dados (carregamento, `fetchCnpj`, `toggleSetor`, `addTarefa`, `handleTipoCriado`, `handleSave`, `executarExclusao`, as três janelas filhas no fim). Mudanças:
  - `handleReabilitar`: `confirm(...)` vira `await confirmar({ titulo: 'Reabilitar cliente?', descricao: \`"${form.nome}" volta a aparecer nos setores onde estava desabilitado.\`, textoConfirmar: 'Reabilitar' })` com `const confirmar = useConfirmar()`.
  - Setores: `SETORES` → `SETORES_DE_CLIENTE` (de `@/lib/clientes-geral`).
  - Remover `inputCls`/`labelCls`. Renderização:

```tsx
  const titulo = readOnly ? 'Ver cliente' : isEdit ? 'Editar cliente' : 'Novo cliente'
  const vinculosAplicaveis = vinculosCatalogo.filter(v => form.setores.includes(v.setor_origem) && form.setores.includes(v.setor_destino))

  return (
    <>
      <Modal
        aberto
        onFechar={onClose}
        bloqueado={saving}
        largura="g"
        titulo={titulo}
        subtitulo={isEdit ? (identidadeSalva?.nome || undefined) : 'Cadastro geral, vale para todos os setores'}
        rodape={
          <div className="flex w-full flex-wrap items-center gap-2.5">
            {!readOnly && isEdit && (
              <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmandoExclusao(true)} disabled={!identidadeSalva || saving}>Excluir cliente</Button>
            )}
            {podeDesabilitar && isEdit && temSetorDesabilitavel && (
              desabilitada
                ? <Button variante="fantasma" onClick={handleReabilitar} carregando={reabilitando}>{reabilitando ? 'Reabilitando…' : 'Reabilitar'}</Button>
                : <Button variante="fantasma" onClick={() => setDesabilitarModalOpen(true)} disabled={saving}>Desabilitar</Button>
            )}
            <div className="ml-auto flex gap-2.5">
              {readOnly ? (
                <Button onClick={onClose}>Fechar</Button>
              ) : (
                <>
                  <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
                  <Button variante="primario" onClick={handleSave} carregando={saving} disabled={loading || !form.nome.trim() || form.setores.length === 0}>
                    {saving ? 'Salvando…' : 'Salvar cliente'}
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-fg-3">Carregando…</p>
        ) : (
          <>
            <Secao titulo="Identificação">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field rotulo="CNPJ" ajuda={loadingCnpj ? 'Buscando dados do CNPJ…' : undefined} className="sm:col-span-2">
                  {c => <Input id={c.id} aria-describedby={c.describedBy} className="font-mono" placeholder="00.000.000/0000-00" disabled={readOnly}
                    value={form.cnpj} onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }} />}
                </Field>
                <Field rotulo="Razão social" obrigatorio className="sm:col-span-2">
                  {c => <Input id={c.id} disabled={readOnly} value={form.nome} onChange={e => set('nome', e.target.value)} />}
                </Field>
                <Field rotulo="Município" className="sm:col-span-2">
                  {c => <Input id={c.id} disabled={readOnly} value={form.municipio} onChange={e => set('municipio', e.target.value)} />}
                </Field>
                <Field rotulo="UF">
                  {c => <Input id={c.id} className="uppercase" maxLength={2} disabled={readOnly} value={form.uf} onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} />}
                </Field>
                <Field rotulo="Contato">
                  {c => <Input id={c.id} placeholder="Nome ou telefone" disabled={readOnly} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} />}
                </Field>
              </div>
            </Secao>

            <Secao titulo="Setores em que o cliente aparece">
              <div role="group" aria-label="Setores" className="flex flex-wrap gap-2">
                {SETORES_DE_CLIENTE.map(s => (
                  <Chip key={s} ativo={form.setores.includes(s)} onClick={() => toggleSetor(s)} disabled={readOnly}>{SETOR_LABEL[s]}</Chip>
                ))}
              </div>
              {!readOnly && form.setores.length === 0 && <p role="alert" className="text-xs text-danger">Selecione ao menos um setor.</p>}
            </Secao>

            <Secao titulo="Tarefas vinculadas entre setores">
              <Switch
                ligado={mostrarVinculos}
                onMudar={v => { setMostrarVinculos(v); if (!v) set('vinculosAtivos', []) }}
                rotulo="Este cliente tem tarefas que liberam outras em outro setor"
                disabled={readOnly}
              />
              {mostrarVinculos && (vinculosAplicaveis.length === 0 ? (
                <p className="text-[13px] text-fg-3">Nenhum vínculo do catálogo se aplica aos setores marcados.</p>
              ) : (
                <ul className="overflow-hidden rounded-[10px] border border-line-soft">
                  {vinculosAplicaveis.map((v, i) => (
                    <li key={v.id} className={cn('px-3.5 py-2.5', i > 0 && 'border-t border-line-soft')}>
                      <Checkbox
                        checked={form.vinculosAtivos.includes(v.id)}
                        disabled={readOnly}
                        onChange={() => set('vinculosAtivos', form.vinculosAtivos.includes(v.id)
                          ? form.vinculosAtivos.filter(id => id !== v.id)
                          : [...form.vinculosAtivos, v.id])}
                        rotulo={
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-fg">
                            {v.tipo_origem} <span className="text-fg-3">({SETOR_LABEL[v.setor_origem]})</span>
                            <ArrowRight size={14} aria-hidden="true" className="text-fg-3" /><span className="sr-only">libera</span>
                            {v.tipo_destino} <span className="text-fg-3">({SETOR_LABEL[v.setor_destino]})</span>
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </Secao>

            {mostraFiscal && isEdit && (
              <SectorSection title="Dados do Fiscal" note="somente leitura, edite em Fiscal › Clientes">
                <CamposFiscais /* mesmas props de hoje, readOnly={true} */ />
              </SectorSection>
            )}
            {mostraFiscal && !isEdit && (
              <Secao titulo="Dados do Fiscal">
                <div className="flex flex-col gap-5">
                  <CamposFiscais /* mesmas props de hoje, readOnly={readOnly} */ />
                </div>
              </Secao>
            )}

            {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
          </>
        )}
      </Modal>
      {/* ConfirmarExclusaoClienteModal, DesabilitarClienteModal e NovoTipoTarefaModal: iguais a hoje */}
    </>
  )
```

E, no fim do arquivo:

```tsx
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      {children}
    </section>
  )
}
```

Imports: `ArrowRight, Trash2` (lucide); `type ReactNode` (react); `Modal`; `Button`; `Field`; `Input, Checkbox, Switch`; `Chip`; `Aviso`; `useConfirmar`; `cn`; `SETORES_DE_CLIENTE` de `@/lib/clientes-geral`; `SETOR_LABEL` continua de `@/lib/types` (tirar `SETORES` do import).

- [ ] **Step 8:** teste passa; `npm test`, `npx tsc --noEmit`, `npx eslint components/geral` → limpos.
- [ ] **Step 9: Commit**

```bash
git add components/geral/ClienteGeralModal.tsx components/geral/ConfirmarExclusaoClienteModal.tsx components/geral/DesabilitarClienteModal.tsx components/geral/NovoTipoTarefaModal.tsx components/geral/SectorSection.tsx tests/cliente-geral-janelas.test.ts
git commit -m "feat(cadastro): janela de cliente e confirmações no Modal comum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Ferramentas (só visual)

Prancheta `g-06-ferramentas`. **Nada muda de funcionamento**: mesmos 3 cartões (SIGA índigo `#8B93F8`, ISS ciano, MEI âmbar), abrir/fechar lista, busca, Exportar planilha (mesma `exportarPlanilha`), coluna `#`, colunas extras do ISS (Município, Login, Senha oculta com botão), Responsável só para admin, botão do TessHub e o aviso dele. Ícones no lugar dos emojis; textos ≥ 12 px; o texto colorido usa `color-mix` com `--fg` para ter contraste nos dois temas.

**Files:**
- Modify: `app/(comum)/ferramentas/FerramentasClient.tsx`, `app/(comum)/ferramentas/page.tsx` (só o `metadata`)
- Test: `tests/ferramentas.test.ts`

**Interfaces:**
- Consumes: `Pagina`, `CabecalhoPagina`, `Button`, `IconButton`, `Input`, `Tabela`/`Th`/`Td`, `NomeCliente`, `Aviso`.
- Produces: `FerramentasClient` com as mesmas props.

- [ ] **Step 1: Teste que falha** — `tests/ferramentas.test.ts`:

```ts
// tests/ferramentas.test.ts — Ferramentas: só visual, mesmos cartões.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FerramentasClient from '../app/(comum)/ferramentas/FerramentasClient'
import type { ClienteComFiscal } from '../lib/clientes-fiscal'

const cli = (extra: Partial<ClienteComFiscal>) => ({ id: 'c1', nome: 'JOAOZINHO DA MOTOCA', cnpj: '321321321000124', confere_siga: true, envia_iss: false, regime: 'Simples Nacional', responsavel: 'Fiscal', ...extra }) as ClienteComFiscal

test('três cartões fechados, com contagem e sem emojis', () => {
  const html = renderToStaticMarkup(h(FerramentasClient, { clientes: [cli({})], isAdmin: true, userNome: 'Admin' }))
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3)
  for (const t of ['SIGA', 'ISS', 'MEI']) assert.match(html, new RegExp(`>${t}<`))
  assert.match(html, /1 cliente</)
  assert.match(html, /0 clientes</)
  assert.doesNotMatch(html, /🔎|📋|🏪/u)
  assert.match(html, /Acessar TessHub/)
  assert.match(html, /O TessHub abre em uma nova aba/)
  assert.doesNotMatch(html, /text-\[(9|10|11)px\]/)
})
```

- [ ] **Step 2:** FAIL (emojis e textos de hoje).

- [ ] **Step 3: Implementar.** Manter `filtrarClientes`, `exportarPlanilha`, estados e `toggleCard` como estão. Trocar `CARD_META` e a renderização:

```tsx
const CARD_META: Record<Ferramenta, { titulo: string; descricao: string; cor: string; Icone: typeof Search }> = {
  SIGA: { titulo: 'SIGA', descricao: 'Clientes com conferência SIGA habilitada', cor: '#8B93F8', Icone: Search },
  ISS: { titulo: 'ISS', descricao: 'Clientes com envio de ISS habilitado', cor: 'var(--acc)', Icone: FileText },
  MEI: { titulo: 'MEI', descricao: 'Clientes do grupo MEI', cor: 'var(--warn)', Icone: Store },
}
// Texto na cor da ferramenta com contraste nos dois temas (mistura com a cor do texto).
const corDeTexto = (cor: string) => `color-mix(in srgb, ${cor} 72%, var(--fg))`
```

```tsx
  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Ferramentas"
        subtitulo={<>Acesso rápido às ferramentas do setor fiscal{!isAdmin && userNome && <span> · {userNome}</span>}</>}
        acoes={
          <a href="https://tesshub.com.br/login" target="_blank" rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-acc bg-acc px-3.5 text-sm font-semibold text-acc-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-page">
            <ExternalLink size={16} aria-hidden="true" />
            Acessar TessHub
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ferramentas.map(tipo => {
          const meta = CARD_META[tipo]
          const total = filtrarClientes(clientes, tipo).length
          const ativo = aberto === tipo
          const Icone = meta.Icone
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => toggleCard(tipo)}
              aria-expanded={ativo}
              aria-controls="lista-ferramenta"
              className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface px-5 py-[18px] text-left transition-colors hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              style={ativo ? { borderColor: meta.cor, background: `color-mix(in srgb, ${meta.cor} 8%, var(--surface))` } : undefined}
            >
              <span className="flex w-full items-center">
                <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${meta.cor} 18%, transparent)`, color: meta.cor }}>
                  <Icone size={20} />
                </span>
                <span className="ml-auto inline-flex h-[22px] items-center rounded-md px-2 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${meta.cor} 16%, transparent)`, color: corDeTexto(meta.cor) }}>
                  {`${total} ${total === 1 ? 'cliente' : 'clientes'}`}
                </span>
              </span>
              <span>
                <span className="block text-lg font-semibold text-fg">{meta.titulo}</span>
                <span className="text-[13px] text-fg-3">{meta.descricao}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: corDeTexto(meta.cor) }}>
                {ativo ? 'Fechar lista' : 'Ver lista'}
                {ativo ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </span>
            </button>
          )
        })}
      </div>

      {aberto && (
        <section id="lista-ferramenta" aria-label={`Clientes ${CARD_META[aberto].titulo}`} className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
            <h2 className="text-[15px] font-semibold text-fg">{CARD_META[aberto].titulo}</h2>
            <span className="text-[13px] text-fg-3">{listaFiltrada.length} {listaFiltrada.length === 1 ? 'resultado' : 'resultados'}</span>
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <Input type="search" aria-label="Buscar por nome ou CNPJ" iconeEsquerda={<Search size={16} />} placeholder="Buscar por nome ou CNPJ"
                value={search} onChange={e => setSearch(e.target.value)} className="sm:w-[280px]" />
              <Button icone={<Download size={16} aria-hidden="true" />} onClick={() => exportarPlanilha(listaFiltrada, aberto)} disabled={listaFiltrada.length === 0}>
                Exportar planilha
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Tabela className={aberto === 'ISS' ? 'min-w-[900px]' : 'min-w-[560px]'}>
              <thead>
                <tr>
                  <Th largura={60}>#</Th>
                  <Th>Razão social</Th>
                  <Th largura={200}>CNPJ</Th>
                  {aberto === 'ISS' && <><Th largura={180}>Município</Th><Th largura={160}>Login ISS</Th><Th largura={160}>Senha ISS</Th></>}
                  {isAdmin && <Th largura={180}>Responsável</Th>}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 && (
                  <tr><Td colSpan={7} alinhar="centro" className="py-10 text-fg-3">Nenhum cliente encontrado.</Td></tr>
                )}
                {listaFiltrada.map((c, i) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-[13px] text-fg-3">{i + 1}</Td>
                    <Td><NomeCliente nome={c.nome} /></Td>
                    <Td className="font-mono text-[13px] text-fg-2">{c.cnpj ?? '—'}</Td>
                    {aberto === 'ISS' && (
                      <>
                        <Td className="text-fg-2">{c.municipio ?? c.mit ?? '—'}{c.uf ? <span className="text-fg-3"> / {c.uf}</span> : ''}</Td>
                        <Td className="font-mono text-[13px] text-fg-2">{c.login_iss ?? '—'}</Td>
                        <Td><SenhaCell senha={c.senha_iss} /></Td>
                      </>
                    )}
                    {isAdmin && <Td className="text-fg-2">{c.responsavel ?? '—'}</Td>}
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        </section>
      )}

      <Aviso tom="info">
        <b>O TessHub abre em uma nova aba.</b> Por segurança dos navegadores, o login não é preenchido automaticamente: use as mesmas credenciais do Portal.
      </Aviso>
    </Pagina>
  )
```

`SenhaCell`:

```tsx
function SenhaCell({ senha }: { senha: string | null }) {
  const [visivel, setVisivel] = useState(false)
  if (!senha) return <span className="text-fg-3">—</span>
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[13px] text-fg-2">{visivel ? senha : '••••••••'}</span>
      <IconButton rotulo={visivel ? 'Ocultar senha' : 'Mostrar senha'} icone={visivel ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        onClick={() => setVisivel(v => !v)} className="h-7 w-7" />
    </div>
  )
}
```

Imports: `ChevronDown, ChevronUp, Download, ExternalLink, Eye, EyeOff, FileText, Search, Store` (lucide); `Pagina, CabecalhoPagina`; `Button, IconButton`; `Input`; `Tabela, Th, Td`; `NomeCliente`; `Aviso`. Remover o `(c, i) =>` sem uso de `i` em `exportarPlanilha` (`SIGA`): `clientes.map(c => [c.cnpj ?? '', c.nome])`. `page.tsx`: `metadata = { title: 'Ferramentas — Tesserato' }`.

- [ ] **Step 4:** teste passa; `npm test`, `npx tsc --noEmit`, `npx eslint "app/(comum)/ferramentas"` → limpos.
- [ ] **Step 5: Commit**

```bash
git add "app/(comum)/ferramentas" tests/ferramentas.test.ts
git commit -m "feat(ferramentas): visual novo, sem mudar o funcionamento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Vínculos de tarefas

Prancheta `g-07-vinculos`. Vínculos ativos primeiro, lidos como frase ("Quando concluir… → …libera"), excluir com confirmação; criar embaixo, com resumo do que será criado e botão com a quantidade.

**Files:**
- Modify: `lib/vinculos.ts` (nova função), `app/(comum)/vinculos/VinculosClient.tsx`, `app/(comum)/vinculos/page.tsx`
- Test: `tests/vinculos.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `calcularNovosPares` (existente), `criarVinculos`/`excluirVinculo` (actions existentes), `SETORES_DE_CLIENTE` (Task 6), `Pagina`, `CabecalhoPagina`, `Card`, `Badge`, `Tabela`/`Th`/`Td`, `EmptyState`, `Field`, `Select`, `Checkbox`, `Button`, `IconButton`, `Aviso`, `useConfirmar`, `useToast`.
- Produces: `resumoNovosVinculos(setorOrigem, tiposOrigem, setorDestino, tiposDestino, pares): string`.

- [ ] **Step 1: Teste que falha** — acrescentar a `tests/vinculos.test.ts` (e `resumoNovosVinculos` no import do topo):

```ts
test('resumo do novo vínculo: nada marcado, um, vários e já existentes', () => {
  assert.equal(resumoNovosVinculos('fiscal', [], 'contabil', ['B'], []), 'Marque ao menos uma tarefa de cada lado.')
  assert.equal(resumoNovosVinculos('fiscal', ['DAS'], 'contabil', ['Envio de Documentos'], [{ tipoOrigem: 'DAS', tipoDestino: 'Envio de Documentos' }]),
    'Será criado 1 vínculo: DAS (Fiscal) libera Envio de Documentos (Contábil).')
  assert.equal(resumoNovosVinculos('fiscal', ['A', 'B'], 'contabil', ['C', 'D'], [
    { tipoOrigem: 'A', tipoDestino: 'C' }, { tipoOrigem: 'A', tipoDestino: 'D' }, { tipoOrigem: 'B', tipoDestino: 'C' },
  ]), 'Serão criados 3 vínculos (1 já existe).')
  assert.equal(resumoNovosVinculos('fiscal', ['A'], 'contabil', ['C', 'D'], [{ tipoOrigem: 'A', tipoDestino: 'C' }, { tipoOrigem: 'A', tipoDestino: 'D' }]),
    'Serão criados 2 vínculos.')
  assert.equal(resumoNovosVinculos('fiscal', ['A'], 'contabil', ['C'], []), 'Todos os vínculos marcados já existem.')
})
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Em `lib/vinculos.ts`, depois de `calcularNovosPares`:

```ts
// Frase que a tela de Vínculos mostra antes de criar.
export function resumoNovosVinculos(
  setorOrigem: UserSetor,
  tiposOrigem: string[],
  setorDestino: UserSetor,
  tiposDestino: string[],
  pares: { tipoOrigem: string; tipoDestino: string }[],
): string {
  if (tiposOrigem.length === 0 || tiposDestino.length === 0) return 'Marque ao menos uma tarefa de cada lado.'
  if (pares.length === 0) return 'Todos os vínculos marcados já existem.'
  if (pares.length === 1) {
    return `Será criado 1 vínculo: ${pares[0].tipoOrigem} (${SETOR_LABEL[setorOrigem]}) libera ${pares[0].tipoDestino} (${SETOR_LABEL[setorDestino]}).`
  }
  const jaExistem = tiposOrigem.length * tiposDestino.length - pares.length
  return `Serão criados ${pares.length} vínculos${jaExistem > 0 ? ` (${jaExistem} já existe${jaExistem === 1 ? '' : 'm'})` : ''}.`
}
```

- [ ] **Step 4:** teste passa.

- [ ] **Step 5: `VinculosClient.tsx`** — mesmos estados e actions. Mudanças de lógica: `pares` calculado na renderização (`useMemo` com `calcularNovosPares(setorOrigem, tiposOrigem, setorDestino, tiposDestino, vinculosIniciais)`); `handleCriar` usa esse `pares` (mantém a mensagem de erro se vazio); sucesso → `avisar(pares.length === 1 ? 'Vínculo criado.' : \`${pares.length} vínculos criados.\`, 'ok')`; `handleExcluir(v)` pergunta antes:

```ts
  async function handleExcluir(v: TarefaVinculo) {
    const ok = await confirmar({
      titulo: 'Excluir vínculo?',
      descricao: `${v.tipo_origem} (${SETOR_LABEL[v.setor_origem]}) deixa de liberar ${v.tipo_destino} (${SETOR_LABEL[v.setor_destino]}).`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    setExcluindoId(v.id)
    const { error } = await excluirVinculo(v.id)
    setExcluindoId(null)
    if (error) { setErro(error); return }
    avisar('Vínculo excluído.', 'ok')
    router.refresh()
  }
```

Renderização:

```tsx
  const resumo = resumoNovosVinculos(setorOrigem, tiposOrigem, setorDestino, tiposDestino, pares)

  return (
    <Pagina>
      <CabecalhoPagina titulo="Vínculos de tarefas" subtitulo='Quando a tarefa de origem é concluída, a tarefa de destino do mesmo cliente mostra o selo "Liberada".' />

      <Card titulo="Vínculos ativos" meta={<Badge>{vinculosIniciais.length}</Badge>} semPadding>
        {vinculosIniciais.length === 0 ? (
          <EmptyState icone={<Link2 size={24} />} titulo="Nenhum vínculo cadastrado" descricao="Crie o primeiro no quadro abaixo." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela className="min-w-[640px]">
              <thead>
                <tr>
                  <Th>Quando concluir…</Th>
                  <Th largura={48}><span className="sr-only">libera</span></Th>
                  <Th>…libera</Th>
                  <Th largura={56}><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {vinculosIniciais.map(v => (
                  <tr key={v.id}>
                    <Td><span className="font-semibold text-fg">{v.tipo_origem}</span> <Badge>{SETOR_LABEL[v.setor_origem]}</Badge></Td>
                    <Td alinhar="centro"><ChevronRight size={18} aria-hidden="true" className="inline text-fg-3" /></Td>
                    <Td><span className="font-semibold text-fg">{v.tipo_destino}</span> <Badge>{SETOR_LABEL[v.setor_destino]}</Badge></Td>
                    <Td alinhar="dir">
                      <IconButton rotulo={`Excluir vínculo ${v.tipo_origem} → ${v.tipo_destino}`} icone={<Trash2 size={16} aria-hidden="true" />}
                        onClick={() => handleExcluir(v)} disabled={excluindoId === v.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      <Card titulo="Novo vínculo">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_48px_1fr] md:items-start">
          <LadoVinculo titulo="origem" setor={setorOrigem} onSetor={s => { setSetorOrigem(s); setTiposOrigem([]) }}
            tipos={tiposOrigemDisponiveis} marcados={tiposOrigem} onMarcar={t => toggleTipo(tiposOrigem, setTiposOrigem, t)} />
          <div aria-hidden="true" className="grid place-items-center text-acc-text md:pt-[124px]">
            <ChevronDown size={28} className="md:hidden" />
            <ChevronRight size={28} className="hidden md:block" />
          </div>
          <LadoVinculo titulo="destino" setor={setorDestino} onSetor={s => { setSetorDestino(s); setTiposDestino([]) }}
            tipos={tiposDestinoDisponiveis} marcados={tiposDestino} onMarcar={t => toggleTipo(tiposDestino, setTiposDestino, t)} />
        </div>
        {erro && <div role="alert" className="mt-4"><Aviso tom="dng">{erro}</Aviso></div>}
        <div className="mt-[18px] flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <p aria-live="polite" className="text-[13px] text-fg-2">{resumo}</p>
          <Button variante="primario" className="ml-auto" icone={<Plus size={16} aria-hidden="true" />} onClick={handleCriar} carregando={saving} disabled={pares.length === 0}>
            {pares.length > 1 ? `Criar ${pares.length} vínculos` : 'Criar vínculo'}
          </Button>
        </div>
      </Card>
    </Pagina>
  )
```

No mesmo arquivo:

```tsx
function LadoVinculo({ titulo, setor, onSetor, tipos, marcados, onMarcar }: {
  titulo: 'origem' | 'destino'
  setor: UserSetor
  onSetor: (s: UserSetor) => void
  tipos: string[]
  marcados: string[]
  onMarcar: (tipo: string) => void
}) {
  const idRotulo = useId()
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field rotulo={`Setor de ${titulo}`}>
        {c => (
          <Select id={c.id} value={setor} onChange={e => onSetor(e.target.value as UserSetor)}>
            {SETORES_DE_CLIENTE.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
          </Select>
        )}
      </Field>
      <span id={idRotulo} className="text-[13px] font-medium text-fg-2">Tarefas de {titulo}</span>
      {tipos.length === 0 ? (
        <p className="text-[13px] text-fg-3">Nenhuma tarefa nesse setor.</p>
      ) : (
        <ul role="group" aria-labelledby={idRotulo} className="max-h-72 overflow-y-auto rounded-[10px] border border-line-soft bg-page">
          {tipos.map((t, i) => {
            const on = marcados.includes(t)
            return (
              <li key={t} className={cn('flex min-h-10 items-center px-3.5', i > 0 && 'border-t border-line-soft', on && 'bg-acc-soft')}>
                <Checkbox rotulo={<span className="text-sm text-fg">{t}</span>} checked={on} onChange={() => onMarcar(t)} className="w-full py-2" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

Remover `selectCls`, `labelCls`, `checkboxRowCls`. Imports: `useId, useMemo, useState` (react); `ChevronDown, ChevronRight, Link2, Plus, Trash2` (lucide); `SETOR_LABEL, type UserSetor, type TarefaVinculo` de `@/lib/types` (sem `SETORES`); `SETORES_DE_CLIENTE` de `@/lib/clientes-geral`; `calcularNovosPares, resumoNovosVinculos` de `@/lib/vinculos`; peças de UI listadas; `useConfirmar`, `useToast`, `cn`.

- [ ] **Step 6: `page.tsx`** — `metadata = { title: 'Vínculos de tarefas — Tesserato' }`; trocar `<><div className="p-8 max-w-4xl mx-auto"><VinculosClient … /></div></>` por `<VinculosClient … />` (a moldura vem do `Pagina` dentro do cliente).
- [ ] **Step 7:** `npm test`, `npx tsc --noEmit`, `npx eslint "app/(comum)/vinculos" lib/vinculos.ts` → limpos.
- [ ] **Step 8: Commit**

```bash
git add lib/vinculos.ts tests/vinculos.test.ts "app/(comum)/vinculos"
git commit -m "feat(vinculos): vínculos ativos em frase, criar com resumo, excluir com confirmação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Varredura, pendências, conferência e PR

**Files:**
- Create: `tests/fase3-varredura.test.ts`
- Modify: o que a varredura e as pendências do ledger apontarem; `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (tabela Andamento)

- [ ] **Step 1: Teste de varredura** — `tests/fase3-varredura.test.ts`:

```ts
// tests/fase3-varredura.test.ts — telas do grupo Geral sem restos do visual antigo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ARQUIVOS = [
  'app/login/page.tsx', 'components/auth/LoginForm.tsx', 'components/auth/CampoSenha.tsx', 'components/auth/TelaAcesso.tsx',
  'app/auth/reset-password/page.tsx', 'app/(comum)/intranet/page.tsx', 'app/fiscal/agenda/page.tsx',
  'components/geral/agenda/Agenda.tsx', 'components/geral/agenda/CalendarioMes.tsx', 'components/geral/agenda/DiaModal.tsx',
  'components/geral/agenda/CompromissoModal.tsx', 'components/geral/LinksUteis.tsx', 'app/(comum)/clientes/page.tsx',
  'components/geral/ClientesGeralLista.tsx', 'components/geral/ClienteGeralModal.tsx', 'components/geral/ConfirmarExclusaoClienteModal.tsx',
  'components/geral/DesabilitarClienteModal.tsx', 'components/geral/NovoTipoTarefaModal.tsx', 'components/geral/SectorSection.tsx',
  'app/(comum)/ferramentas/FerramentasClient.tsx', 'app/(comum)/vinculos/VinculosClient.tsx', 'app/(comum)/vinculos/page.tsx',
]

for (const arq of ARQUIVOS) {
  test(`sem visual antigo: ${arq}`, () => {
    const fonte = readFileSync(join(ROOT, arq), 'utf8')
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, 'texto abaixo de 12 px')
    assert.doesNotMatch(fonte, /\[var\(--(fg|accent|accent-hover|bg-surface|bg-page)\)\]/, 'cor antiga por var()')
    assert.doesNotMatch(fonte, /\b(amber|red|green|emerald|indigo|orange)-\d{3}\b/, 'cor fixa do Tailwind')
    assert.doesNotMatch(fonte, /(^|[^.\w])(confirm|alert)\(/m, 'confirm()/alert() do navegador')
    assert.doesNotMatch(fonte, /fixed inset-0/, 'janela montada à mão')
    assert.doesNotMatch(fonte, /[🔎📋🏪📢🔔✏✕⚠]/u, 'emoji no lugar de ícone')
  })
}
```

- [ ] **Step 2:** `node --import tsx --test tests/fase3-varredura.test.ts` → corrigir o que falhar (nos arquivos da lista, sem mexer em lógica) até passar.
- [ ] **Step 3: Onda de pendências** — reunir **todos** os itens "minor"/"deferred" do ledger desta fase e corrigi-los agora, num commit só (regra do usuário de 2026-10-02: nada de "ficou para depois"). Só fica de fora o que depender de decisão do usuário (ex.: R2) — esses vão como pergunta na mensagem final, não como pendência silenciosa. Re-revisão da onda.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` (ou `npx eslint` em todos os arquivos tocados), `npm run build` → limpos.
- [ ] **Step 5: Conferência no navegador** (controller, não subagente): copiar o `.env.local` para o worktree **uma vez** (se negado, não contornar: deixar a conferência para o usuário na PR), subir `npm run dev -- -p 3120` pelo Runner do Termbaker, logar no banco de **dev** com a conta admin de teste, e abrir em 1440 px e no iPhone 13 (`browser_responsive`): `/login` (deslogado), `/intranet` (abrir um dia, criar e excluir um compromisso de teste), `/fiscal/agenda`, `/clientes` (filtros; abrir um cliente; não salvar), `/ferramentas` (abrir SIGA e ISS), `/vinculos` (não criar nem excluir). Medir `scrollWidth <= clientWidth` no celular. Ao fim: parar o Runner e apagar a cópia do `.env.local`.
- [ ] **Step 6:** Atualizar a linha "3 Geral" da tabela Andamento do plano geral (`feat/redesign-fase3-geral`, PR, situação); commit.
- [ ] **Step 7:** Revisão final da branch inteira (base = topo da Fase 2, `ceda10d`), consertos e re-revisão.
- [ ] **Step 8:** `git push -u origin feat/redesign-fase3-geral` e `gh pr create --base dev` com: o que muda (lista "Muda de funcionamento" acima), verificação, aviso de que a PR está empilhada na #193 (mergear a #193 antes), pergunta R2 (senha no Desabilitar), roteiro de teste. **Não mergear.**
