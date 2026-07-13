# Modo claro/escuro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão de alternância entre modo escuro (atual) e modo claro (neutro-frio) para o portal inteiro, sem mudar a estrutura de dados nem o backend.

**Architecture:** Um pequeno conjunto de variáveis CSS de tema (`--bg-page`, `--bg-surface`, `--bg-surface-2`, `--fg`, `--accent`, `--accent-hover`) definidas em `app/globals.css`, alternadas via a classe `.light` no `<html>`. Um hook `useTheme()` controla a classe e persiste a escolha em `localStorage`. Todos os componentes que hoje usam cores fixas (`bg-[#111e3a]`, `text-white/70`, etc.) passam a referenciar essas variáveis via classes Tailwind arbitrárias (`bg-[var(--bg-page)]`, `text-[var(--fg)]/70`).

**Tech Stack:** Next.js (App Router) + Tailwind CSS v4 (`@tailwindcss/postcss`, sem `tailwind.config.js`), React 19, `lucide-react` para ícones.

## Global Constraints

- Paleta clara aprovada (neutro frio): `--bg-page: #f4f6fb`, `--bg-surface: #ffffff`, `--bg-surface-2: #eef1f7`, `--fg: #111e3a`, `--accent: #00A8C4`, `--accent-hover: #008fac`.
- Paleta escura (valores atuais, permanecem default): `--bg-page: #111e3a`, `--bg-surface: #162444`, `--bg-surface-2: #0b1019`, `--fg: #ffffff`, `--accent: #00CCEB`, `--accent-hover: #00b3d4`.
- Preferência de tema fica só em `localStorage` (chave `tesserato-theme`), não no banco de dados.
- Badges de status (verde/vermelho/âmbar de tarefas concluídas/pendentes) e o overlay preto de fundo de modais (`bg-black/NN`) **não são alterados** — ficam com as cores atuais do Tailwind nos dois temas.
- HTML gerado para impressão (`window.open` em Relatórios e Parcelamentos) **não é alterado** — mantém sempre a paleta clara que já usa hoje.
- Botão de alternância mostra o modo de **destino** (para onde vai mudar ao clicar), não o modo atual: no escuro mostra "Light Mode", no claro mostra "Dark Mode".

---

## Visão geral dos arquivos afetados

Além da infraestrutura nova (`lib/theme.ts`, edições em `app/globals.css`, `app/layout.tsx`, `components/fiscal/Sidebar.tsx`), os 35 arquivos abaixo têm cores fixas convertidas para variáveis via um comando `sed` mecânico e idêntico em todos, distribuídos em 6 lotes (Tasks 4–9):

```
app/auth/reset-password/page.tsx
app/fiscal/admin/page.tsx
app/fiscal/agenda/page.tsx
app/fiscal/bots/page.tsx
app/fiscal/calendario/page.tsx
app/fiscal/clientes/[id]/page.tsx
app/fiscal/conferencia/page.tsx
app/fiscal/dashboard/page.tsx
app/fiscal/ferramentas/FerramentasClient.tsx
app/fiscal/historico/page.tsx
app/fiscal/intranet/page.tsx
app/fiscal/layout.tsx
app/fiscal/parametros/ParametrosClient.tsx
app/fiscal/parcelamentos/page.tsx
app/fiscal/relatorios/page.tsx
app/fiscal/tarefas/page.tsx
app/login/page.tsx
components/auth/LoginForm.tsx
components/fiscal/AdminUsuarios.tsx
components/fiscal/AgendaPessoal.tsx
components/fiscal/BotsConfigForm.tsx
components/fiscal/CalendarioFiscal.tsx
components/fiscal/ClienteAcoes.tsx
components/fiscal/ClienteArquivos.tsx
components/fiscal/ClienteConferencia.tsx
components/fiscal/ClienteObs.tsx
components/fiscal/ClientesLista.tsx
components/fiscal/CorrigirAtividadesClient.tsx
components/fiscal/CorrigirTarefasClient.tsx
components/fiscal/DevLock.tsx
components/fiscal/EmpresaModal.tsx
components/fiscal/LinksRapidos.tsx
components/fiscal/MesSeletor.tsx
components/fiscal/TarefaChecklist.tsx
components/fiscal/TopNav.tsx
```

`components/fiscal/Sidebar.tsx` recebe o mesmo tratamento dentro da Task 3, junto com o botão de alternância, porque é o mesmo arquivo que precisa das duas mudanças.

O comando de conversão (idêntico em toda task de lote) é:

```bash
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  <arquivo1> <arquivo2> ...
```

Isso é seguro porque, no código-fonte de `app/` e `components/` (fora de `app/globals.css`, que é editado manualmente na Task 1), esses 5 códigos hex e as 4 combinações `bg-/text-/border-/placeholder- + white` **só aparecem dentro de classes Tailwind de valor arbitrário** (`bg-[#162444]`, `text-white/70` etc.) — confirmado por busca no código antes de escrever este plano. A troca de substring preserva qualquer sufixo de opacidade (`/NN`) que já exista.

---

### Task 1: Tokens de tema em `globals.css`

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: variáveis CSS `--bg-page`, `--bg-surface`, `--bg-surface-2`, `--fg`, `--accent`, `--accent-hover`, disponíveis globalmente e usadas por todas as tasks seguintes via `var(--nome)` dentro de classes Tailwind arbitrárias.

- [ ] **Step 1: Substituir o conteúdo de `app/globals.css`**

Conteúdo atual:
```css
@import "tailwindcss";

:root {
  --background: #111e3a;
}

body {
  background: var(--background);
  color: white;
}
```

Novo conteúdo:
```css
@import "tailwindcss";

:root {
  --bg-page: #111e3a;
  --bg-surface: #162444;
  --bg-surface-2: #0b1019;
  --fg: #ffffff;
  --accent: #00CCEB;
  --accent-hover: #00b3d4;
}

:root.light {
  --bg-page: #f4f6fb;
  --bg-surface: #ffffff;
  --bg-surface-2: #eef1f7;
  --fg: #111e3a;
  --accent: #00A8C4;
  --accent-hover: #008fac;
}

body {
  background: var(--bg-page);
  color: var(--fg);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: adiciona tokens de tema claro/escuro em globals.css"
```

---

### Task 2: Hook `useTheme` e script anti-flash

**Files:**
- Create: `lib/theme.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nenhuma dependência de outras tasks.
- Produces: `useTheme(): { theme: 'dark' | 'light', toggleTheme: () => void }`, exportado de `lib/theme.ts`, usado pela Task 3 no `Sidebar.tsx`.

- [ ] **Step 1: Criar `lib/theme.ts`**

```ts
'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tesserato-theme'

export type Theme = 'dark' | 'light'

function lerTemaAtual(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(lerTemaAtual())
  }, [])

  function toggleTheme() {
    const novo: Theme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('light', novo === 'light')
    localStorage.setItem(STORAGE_KEY, novo)
    setTheme(novo)
  }

  return { theme, toggleTheme }
}
```

- [ ] **Step 2: Adicionar script anti-flash em `app/layout.tsx`**

Arquivo atual:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal do Colaborador — Tesserato",
  description: "Portal interno da Tesserato Contabilidade.",
  icons: { icon: '/logo.ico' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

Novo conteúdo (adiciona o script dentro de `<head>`, antes do `<body>`):
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal do Colaborador — Tesserato",
  description: "Portal interno da Tesserato Contabilidade.",
  icons: { icon: '/logo.ico' },
};

const TEMA_SCRIPT = `
  try {
    if (localStorage.getItem('tesserato-theme') === 'light') {
      document.documentElement.classList.add('light');
    }
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verificar que o app ainda sobe sem erros**

Se houver um servidor de preview rodando, recarregue a página inicial e confira no console que não há erros de hidratação. Se não houver servidor rodando, rode `npm run dev` no diretório `portal-tesserato` e acesse `http://localhost:3000`.

- [ ] **Step 4: Commit**

```bash
git add lib/theme.ts app/layout.tsx
git commit -m "feat: adiciona hook useTheme e script anti-flash de tema"
```

---

### Task 3: Botão de alternância na Sidebar + conversão do próprio arquivo

**Files:**
- Modify: `components/fiscal/Sidebar.tsx`

**Interfaces:**
- Consumes: `useTheme` de `lib/theme.ts` (Task 2).
- Produces: nenhuma interface nova consumida por outras tasks — é folha da árvore.

- [ ] **Step 1: Rodar a conversão mecânica de cores no arquivo**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  components/fiscal/Sidebar.tsx
```

- [ ] **Step 2: Adicionar import do hook e dos ícones**

Old string:
```tsx
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import MesSeletor from './MesSeletor'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, CreditCard, Wrench, Settings, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
```

New string:
```tsx
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { useTheme } from '@/lib/theme'
import MesSeletor from './MesSeletor'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, CreditCard, Wrench, Settings, ShieldCheck,
  Sun, Moon,
  type LucideIcon,
} from 'lucide-react'
```

- [ ] **Step 3: Usar o hook dentro do componente**

Old string:
```tsx
export default function Sidebar({ profile, mes, ano }: Props) {
  const pathname = usePathname()
  const router = useRouter()
```

New string:
```tsx
export default function Sidebar({ profile, mes, ano }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
```

- [ ] **Step 4: Inserir o botão de alternância antes do botão "Sair"**

Old string (note: após a conversão do Step 1, `border-white/8` já virou `border-[var(--fg)]/8`):
```tsx
      <div className="px-4 py-4 border-t border-[var(--fg)]/8">
        <div className="flex items-center gap-3 mb-3">
```

New string:
```tsx
      <div className="px-4 py-4 border-t border-[var(--fg)]/8">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 text-left text-[var(--fg)]/40 hover:text-[var(--fg)]/70 text-xs transition-colors px-1 py-1.5 mb-2"
        >
          {theme === 'light' ? <Moon size={13} strokeWidth={1.75} /> : <Sun size={13} strokeWidth={1.75} />}
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
        <div className="flex items-center gap-3 mb-3">
```

- [ ] **Step 5: Verificação visual manual**

Suba o dev server (`npm run dev` no diretório `portal-tesserato`, se ainda não estiver rodando) e, logado no portal:
1. Confirme que a sidebar aparece igual a antes (modo escuro).
2. Clique no botão novo — deve estar escrito "Light Mode" com ícone de sol.
3. Após clicar, o texto do botão do fundo de a sidebar deve virar branco no HTML mas ainda não vai parecer "clara" visualmente até as próximas tasks converterem o resto das páginas — isso é esperado neste ponto do plano. Confirme só que a classe `light` foi adicionada em `<html>` (inspecione via devtools ou `document.documentElement.className`) e que o texto do botão virou "Dark Mode" com ícone de lua.
4. Recarregue a página — a classe `light` deve persistir (o script anti-flash da Task 2 leu o `localStorage`).
5. Clique de novo para voltar a "dark" antes de prosseguir, deixando o estado padrão para as próximas verificações.

- [ ] **Step 6: Commit**

```bash
git add components/fiscal/Sidebar.tsx
git commit -m "feat: adiciona botao de alternancia de tema na Sidebar"
```

---

### Task 4: Conversão — shell e autenticação

**Files:**
- Modify: `app/auth/reset-password/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `components/auth/LoginForm.tsx`
- Modify: `app/fiscal/layout.tsx`
- Modify: `components/fiscal/TopNav.tsx`
- Modify: `components/fiscal/MesSeletor.tsx`

**Interfaces:** Nenhuma — conversão mecânica isolada por arquivo, sem dependências entre tasks de lote.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  app/auth/reset-password/page.tsx \
  app/login/page.tsx \
  components/auth/LoginForm.tsx \
  app/fiscal/layout.tsx \
  components/fiscal/TopNav.tsx \
  components/fiscal/MesSeletor.tsx
```

- [ ] **Step 2: Verificação visual manual**

Com o dev server rodando: acesse `/login`, confira legibilidade. Depois logado, na sidebar clique "Light Mode" e confira a barra superior (`TopNav`, se usada na página atual) e o seletor de mês (`MesSeletor`) — texto e fundo devem ficar claros e legíveis, sem branco-sobre-branco nem navy-sobre-navy. Clique de novo para voltar a "Dark Mode".

- [ ] **Step 3: Commit**

```bash
git add app/auth/reset-password/page.tsx app/login/page.tsx components/auth/LoginForm.tsx app/fiscal/layout.tsx components/fiscal/TopNav.tsx components/fiscal/MesSeletor.tsx
git commit -m "feat: aplica tokens de tema no shell e autenticacao"
```

---

### Task 5: Conversão — Clientes

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`
- Modify: `components/fiscal/ClienteAcoes.tsx`
- Modify: `components/fiscal/ClienteArquivos.tsx`
- Modify: `components/fiscal/ClienteConferencia.tsx`
- Modify: `components/fiscal/ClienteObs.tsx`
- Modify: `components/fiscal/ClientesLista.tsx`
- Modify: `components/fiscal/EmpresaModal.tsx`

**Interfaces:** Nenhuma.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  "app/fiscal/clientes/[id]/page.tsx" \
  components/fiscal/ClienteAcoes.tsx \
  components/fiscal/ClienteArquivos.tsx \
  components/fiscal/ClienteConferencia.tsx \
  components/fiscal/ClienteObs.tsx \
  components/fiscal/ClientesLista.tsx \
  components/fiscal/EmpresaModal.tsx
```

- [ ] **Step 2: Verificação visual manual**

Com o dev server rodando e logado: acesse `/fiscal/clientes`, alterne para "Light Mode" na sidebar, confira a lista de clientes, abra um cliente (`ClienteAcoes`, `ClienteArquivos`, `ClienteConferencia`, `ClienteObs`) e o modal de cadastro/edição (`EmpresaModal`). Volte para "Dark Mode" ao final.

- [ ] **Step 3: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx" components/fiscal/ClienteAcoes.tsx components/fiscal/ClienteArquivos.tsx components/fiscal/ClienteConferencia.tsx components/fiscal/ClienteObs.tsx components/fiscal/ClientesLista.tsx components/fiscal/EmpresaModal.tsx
git commit -m "feat: aplica tokens de tema nas telas de clientes"
```

---

### Task 6: Conversão — Intranet, Dashboard, Calendário, Agenda

**Files:**
- Modify: `app/fiscal/agenda/page.tsx`
- Modify: `components/fiscal/AgendaPessoal.tsx`
- Modify: `app/fiscal/calendario/page.tsx`
- Modify: `components/fiscal/CalendarioFiscal.tsx`
- Modify: `app/fiscal/intranet/page.tsx`
- Modify: `components/fiscal/LinksRapidos.tsx`
- Modify: `app/fiscal/dashboard/page.tsx`

**Interfaces:** Nenhuma.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  app/fiscal/agenda/page.tsx \
  components/fiscal/AgendaPessoal.tsx \
  app/fiscal/calendario/page.tsx \
  components/fiscal/CalendarioFiscal.tsx \
  app/fiscal/intranet/page.tsx \
  components/fiscal/LinksRapidos.tsx \
  app/fiscal/dashboard/page.tsx
```

- [ ] **Step 2: Verificação visual manual**

Com o dev server rodando e logado, alterne para "Light Mode" e confira, nesta ordem: `/fiscal/intranet` (cards de links rápidos), `/fiscal/dashboard`, `/fiscal/calendario`, `/fiscal/agenda`. Volte para "Dark Mode" ao final.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/agenda/page.tsx components/fiscal/AgendaPessoal.tsx app/fiscal/calendario/page.tsx components/fiscal/CalendarioFiscal.tsx app/fiscal/intranet/page.tsx components/fiscal/LinksRapidos.tsx app/fiscal/dashboard/page.tsx
git commit -m "feat: aplica tokens de tema em intranet, dashboard, calendario e agenda"
```

---

### Task 7: Conversão — Relatórios, Parcelamentos, Histórico, Tarefas

**Files:**
- Modify: `app/fiscal/relatorios/page.tsx`
- Modify: `app/fiscal/parcelamentos/page.tsx`
- Modify: `app/fiscal/historico/page.tsx`
- Modify: `app/fiscal/tarefas/page.tsx`
- Modify: `components/fiscal/TarefaChecklist.tsx`

**Interfaces:** Nenhuma.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  app/fiscal/relatorios/page.tsx \
  app/fiscal/parcelamentos/page.tsx \
  app/fiscal/historico/page.tsx \
  app/fiscal/tarefas/page.tsx \
  components/fiscal/TarefaChecklist.tsx
```

- [ ] **Step 2: Verificação visual manual**

Importante: o `sed` também vai converter as cores usadas dentro das strings de template do HTML de impressão (`imprimir()`, em `relatorios/page.tsx` e `parcelamentos/page.tsx`) — isso é indesejado, pois esse HTML deve continuar sempre claro e fixo, independente do tema do portal (ver Global Constraints). Depois de rodar o `sed`, abra os dois arquivos e reverta manualmente qualquer `var(--...)` que tenha aparecido dentro das template strings de `imprimir()` (procure por `const html = \`<!DOCTYPE...` em cada arquivo), voltando aos valores hex originais (`#00CCEB`, `#162444` etc. — os mesmos valores que estavam lá antes deste plano, iguais aos que ainda existem em `app/fiscal/parametros/ParametrosClient.tsx` e nas outras telas como referência do padrão hex original).

Com o dev server rodando e logado, alterne para "Light Mode" e confira `/fiscal/relatorios` (inclusive o filtro de tarefa adicionado anteriormente), `/fiscal/parcelamentos`, `/fiscal/historico`. Gere o PDF de impressão em Relatórios e Parcelamentos e confirme que continua com fundo claro/preto sobre branco como antes (não deve ter mudado). Volte para "Dark Mode" ao final.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/relatorios/page.tsx app/fiscal/parcelamentos/page.tsx app/fiscal/historico/page.tsx app/fiscal/tarefas/page.tsx components/fiscal/TarefaChecklist.tsx
git commit -m "feat: aplica tokens de tema em relatorios, parcelamentos, historico e tarefas"
```

---

### Task 8: Conversão — Ferramentas, Bots, Conferência

**Files:**
- Modify: `app/fiscal/ferramentas/FerramentasClient.tsx`
- Modify: `app/fiscal/bots/page.tsx`
- Modify: `components/fiscal/BotsConfigForm.tsx`
- Modify: `app/fiscal/conferencia/page.tsx`
- Modify: `components/fiscal/DevLock.tsx`

**Interfaces:** Nenhuma.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  app/fiscal/ferramentas/FerramentasClient.tsx \
  app/fiscal/bots/page.tsx \
  components/fiscal/BotsConfigForm.tsx \
  app/fiscal/conferencia/page.tsx \
  components/fiscal/DevLock.tsx
```

- [ ] **Step 2: Verificação visual manual**

Com o dev server rodando e logado, alterne para "Light Mode" e confira `/fiscal/ferramentas`, `/fiscal/bots` (incluindo o `DevLock`, se estiver bloqueado peça a senha de dev para destravar e ver a tela real), `/fiscal/conferencia`. Volte para "Dark Mode" ao final.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/ferramentas/FerramentasClient.tsx app/fiscal/bots/page.tsx components/fiscal/BotsConfigForm.tsx app/fiscal/conferencia/page.tsx components/fiscal/DevLock.tsx
git commit -m "feat: aplica tokens de tema em ferramentas, bots e conferencia"
```

---

### Task 9: Conversão — Parâmetros, Admin, Correções

**Files:**
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`
- Modify: `app/fiscal/admin/page.tsx`
- Modify: `components/fiscal/AdminUsuarios.tsx`
- Modify: `components/fiscal/CorrigirAtividadesClient.tsx`
- Modify: `components/fiscal/CorrigirTarefasClient.tsx`

**Interfaces:** Nenhuma.

- [ ] **Step 1: Rodar a conversão mecânica**

```bash
cd "portal-tesserato"
sed -i -E \
  -e 's/#00CCEB/var(--accent)/g' \
  -e 's/#00b3d4/var(--accent-hover)/g' \
  -e 's/#111e3a/var(--bg-page)/g' \
  -e 's/#162444/var(--bg-surface)/g' \
  -e 's/#0b1019/var(--bg-surface-2)/g' \
  -e 's/(bg|text|border|placeholder)-white/\1-[var(--fg)]/g' \
  app/fiscal/parametros/ParametrosClient.tsx \
  app/fiscal/admin/page.tsx \
  components/fiscal/AdminUsuarios.tsx \
  components/fiscal/CorrigirAtividadesClient.tsx \
  components/fiscal/CorrigirTarefasClient.tsx
```

- [ ] **Step 2: Verificação visual manual**

Com o dev server rodando e logado como admin, alterne para "Light Mode" e confira `/fiscal/parametros` (todas as abas/seções do `ParametrosClient`, que é o maior arquivo do lote) e `/fiscal/admin` (incluindo `AdminUsuarios`). As telas de correção (`CorrigirAtividadesClient`, `CorrigirTarefasClient`) costumam ser acionadas a partir de Parâmetros — confira se abrem corretamente. Volte para "Dark Mode" ao final.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/parametros/ParametrosClient.tsx app/fiscal/admin/page.tsx components/fiscal/AdminUsuarios.tsx components/fiscal/CorrigirAtividadesClient.tsx components/fiscal/CorrigirTarefasClient.tsx
git commit -m "feat: aplica tokens de tema em parametros, admin e correcoes"
```

---

### Task 10: Varredura final

**Files:**
- Nenhum arquivo novo — task de verificação.

**Interfaces:** Nenhuma.

- [ ] **Step 1: Confirmar que não sobrou nenhuma cor fixa fora do escopo definido**

```bash
cd "portal-tesserato"
grep -rlE "#00CCEB|#00b3d4|#111e3a|#162444|#0b1019|bg-white|text-white|border-white|placeholder-white" app components --include="*.tsx"
```

Resultado esperado: nenhum arquivo, **exceto** os dois blocos de `imprimir()` (HTML de impressão) em `app/fiscal/relatorios/page.tsx` e `app/fiscal/parcelamentos/page.tsx`, que foram revertidos de propósito na Task 7. Se aparecer qualquer outro arquivo, complete a conversão manualmente nele antes de prosseguir.

- [ ] **Step 2: Passeio completo pelo portal em modo claro**

Com o dev server rodando e logado como admin: ative "Light Mode" na sidebar e clique, em sequência, em todos os itens do menu (Intranet, Dashboard, Clientes, Calendário, Relatórios, Histórico, Parcelamentos, Ferramentas, Parâmetros, Admin). Em cada tela, confira que não há texto invisível (mesma cor do fundo) nem contraste ruim. Anote qualquer problema encontrado e corrija no arquivo correspondente antes do commit final.

- [ ] **Step 3: Confirmar persistência entre reload**

Com "Light Mode" ativo, recarregue a página (F5) — o tema claro deve continuar aplicado sem piscar o escuro primeiro. Clique no botão para voltar a "Dark Mode" e recarregue de novo — deve voltar ao escuro.

- [ ] **Step 4: Commit final (se houve correções na varredura)**

```bash
git add -A
git commit -m "fix: ajustes finais de contraste no modo claro"
```

Se não houve nenhuma correção no Step 2, pule este commit — não crie um commit vazio.
