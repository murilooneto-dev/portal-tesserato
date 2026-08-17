# Remover autenticação step-up da seção ADMIN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a camada extra de login (`ts_admin`/`admin_users`) da seção ADMIN, deixando `profiles.role = 'admin'` (já verificado hoje em paralelo) como única guarda de acesso.

**Architecture:** Remoção pura de código — nenhuma tabela, RPC ou migration nova. Cada task remove um conjunto de chamadores da camada antiga e roda `npx tsc --noEmit` como verificação (não há suíte automatizada cobrindo auth neste projeto; a lógica em si — checagem de `role='admin'`, redirects — já existe e não muda). A última task remove os arquivos que ficam órfãos e faz a verificação manual no navegador.

**Tech Stack:** Next.js (App Router, Server Actions), Supabase Auth, TypeScript.

## Global Constraints

- Não criar nem alterar migrations — `admin_users` e as RPCs continuam no banco, sem uso (decisão explícita do usuário).
- Não remover a env var `ADMIN_SESSION_SECRET` da Vercel — fora de escopo, fica órfã.
- A checagem de `role='admin'` que já existe em cada arquivo tocado NÃO muda — só se remove o que rodava ao lado dela.
- Cada task termina com `npx tsc --noEmit` limpo (rodar do diretório `portal-tesserato`).

---

### Task 1: `proxy.ts` — remover verificação do cookie `ts_admin`

**Files:**
- Modify: `proxy.ts:1-113`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task).
- Produces: nada consumido por tasks seguintes — mudança isolada.

- [ ] **Step 1: Ler o estado atual do bloco a remover**

Confirmar que `proxy.ts` ainda tem exatamente este formato (linhas 76-113 na versão atual):

```ts
  // Seção ADMIN (Parâmetros/Vínculos): exige role='admin' do portal *e*
  // sessão própria ts_admin (defesa em profundidade — modelo mais
  // restritivo assumido pela Arquitetura para a feature TES-3). O proxy
  // só verifica assinatura/expiração do JWT (Edge-safe, sem query pesada);
  // a verificação de senha em si acontece só no login, via RPC no Postgres.
  if (ehRotaAdmin(pathname)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return redirectComCookies(new URL('/intranet', request.url), supabaseResponse)
    }

    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    const session = token ? await verifyAdminToken(token) : null

    if (!session || session.mustChangePassword) {
      const url = new URL('/admin/bloqueio', request.url)
      url.searchParams.set('next', pathname)
      if (session?.mustChangePassword) url.searchParams.set('etapa', 'trocar-senha')
      return redirectComCookies(url, supabaseResponse)
    }

    // Renovação por inatividade (sliding window): reemite o cookie a cada
    // acesso válido às rotas ADMIN, preservando `loginAt` para manter o
    // teto de expiração absoluta de 8h.
    const renovado = await signAdminToken({
      sub: session.sub,
      username: session.username,
      mustChangePassword: session.mustChangePassword,
      loginAt: session.loginAt,
    })
    supabaseResponse.cookies.set(ADMIN_SESSION_COOKIE, renovado, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_INACTIVITY_TTL_SECONDS,
    })
  }
```

- [ ] **Step 2: Substituir pelo bloco reduzido**

Trocar o bloco acima por:

```ts
  // Seção ADMIN (Parâmetros/Vínculos): exige role='admin' do portal.
  if (ehRotaAdmin(pathname)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return redirectComCookies(new URL('/intranet', request.url), supabaseResponse)
    }
  }
```

- [ ] **Step 3: Remover os imports que ficaram sem uso**

Em `proxy.ts:7-8`, remover as duas linhas:

```ts
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_INACTIVITY_TTL_SECONDS } from '@/lib/admin-auth/constants'
import { signAdminToken, verifyAdminToken } from '@/lib/admin-auth/session'
```

`ehRotaAdmin` (de `@/lib/rotas-admin`, linha 6) continua em uso — não mexer nesse import.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `proxy.ts`. (Erros pré-existentes em outros arquivos, se houver, não são desta task — mas nesta altura do plano `lib/admin-auth/*` ainda existe, então não deve haver erro nenhum novo.)

- [ ] **Step 5: Commit**

```bash
git add proxy.ts
git commit -m "refactor: remove verificação ts_admin do proxy da seção ADMIN"
```

---

### Task 2: Páginas ADMIN — remover `requireAdminSection()` e o banner de sessão

**Files:**
- Modify: `app/fiscal/parametros/page.tsx:1-25`
- Modify: `app/admin/configuracoes/page.tsx:1-24`
- Modify: `app/(comum)/vinculos/page.tsx:1-21`

**Interfaces:**
- Consumes: nada.
- Produces: nada consumido por tasks seguintes.

- [ ] **Step 1: `app/fiscal/parametros/page.tsx` — remover import e chamada**

Remover a linha 3:

```ts
import { requireAdminSection } from '@/lib/admin-auth/server'
```

Remover a linha 4:

```ts
import SairAdminButton from '@/components/admin/SairAdminButton'
```

Remover as linhas 22-25 (comentário + chamada):

```ts
  // Guarda autoritativa da seção ADMIN (RNF2/RN1/CA5) — o proxy.ts já
  // intercepta a navegação, mas a verificação aqui, antes de qualquer
  // query, é a que realmente protege os dados desta página.
  await requireAdminSection('/fiscal/parametros')
```

Mais abaixo no mesmo arquivo, remover o uso `<SairAdminButton />` do JSX (procurar a ocorrência e apagar a linha/tag inteira).

- [ ] **Step 2: `app/admin/configuracoes/page.tsx` — remover import e chamada**

Remover a linha 3:

```ts
import { requireAdminSection } from '@/lib/admin-auth/server'
```

Remover a linha 4:

```ts
import SairAdminButton from '@/components/admin/SairAdminButton'
```

Remover as linhas 22-24:

```ts
  // Guarda autoritativa da seção ADMIN — mesmo padrão de
  // app/fiscal/parametros/page.tsx.
  await requireAdminSection('/admin/configuracoes')
```

Remover o `<SairAdminButton />` do JSX logo abaixo (ele é o primeiro elemento dentro do fragment `<>...</>`).

- [ ] **Step 3: `app/(comum)/vinculos/page.tsx` — remover import e chamada**

Remover a linha 3:

```ts
import { requireAdminSection } from '@/lib/admin-auth/server'
```

Remover a linha 4:

```ts
import SairAdminButton from '@/components/admin/SairAdminButton'
```

Remover as linhas 18-21:

```ts
  // Guarda autoritativa da seção ADMIN (RNF2/RN1/CA5) — o proxy.ts já
  // intercepta a navegação, mas a verificação aqui, antes de qualquer
  // query, é a que realmente protege os dados desta página.
  await requireAdminSection('/vinculos')
```

Remover o `<SairAdminButton />` do JSX logo abaixo (primeiro elemento dentro do fragment).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos nas 3 páginas. (`components/admin/SairAdminButton.tsx` e `lib/admin-auth/server.ts` continuam existindo até a Task 4 — nenhum outro arquivo os importa mais depois desta task, mas isso não gera erro de tipo, só código morto temporário.)

- [ ] **Step 5: Commit**

```bash
git add "app/fiscal/parametros/page.tsx" "app/admin/configuracoes/page.tsx" "app/(comum)/vinculos/page.tsx"
git commit -m "refactor: remove guarda ts_admin e banner das páginas da seção ADMIN"
```

---

### Task 3: Server Actions — remover checagem de sessão `ts_admin`

**Files:**
- Modify: `lib/config-entidades-actions.ts:1-40`
- Modify: `lib/tarefa-tipo-vinculos-actions.ts:1-31`
- Modify: `app/(comum)/vinculos/actions.ts:1-33`
- Modify: `app/fiscal/parametros/actions.ts` (12 pontos de chamada + a função helper)

**Interfaces:**
- Consumes: nada.
- Produces: nada consumido por tasks seguintes.

- [ ] **Step 1: `lib/config-entidades-actions.ts` — reduzir `exigirAdmin()`**

Estado atual (linhas 1-40, ver abaixo o trecho relevante):

```ts
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
```

```ts
async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const session = await getValidAdminSession()
  if (!session) return { error: ERRO_SESSAO_ADMIN, supabase: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
```

Substituir por (remove a checagem de sessão, mantém a de role):

```ts
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
```

```ts
async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
```

A constante `ERRO_SESSAO_ADMIN` (linha 26) fica sem uso — remover essa linha também.

- [ ] **Step 2: `lib/tarefa-tipo-vinculos-actions.ts` — mesma redução**

Aplicar exatamente a mesma mudança do Step 1 (mesmo formato de arquivo: import de `getValidAdminSession`, `exigirAdmin()` com o mesmo corpo, constante `ERRO_SESSAO_ADMIN`).

- [ ] **Step 3: `app/(comum)/vinculos/actions.ts` — reduzir `exigirAcessoAdmin()`**

Estado atual:

```ts
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
```

```ts
async function exigirAcessoAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return null

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null

  const adminSession = await getValidAdminSession()
  if (!adminSession) return null

  return supabase
}
```

Substituir por:

```ts
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
```

```ts
async function exigirAcessoAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return null

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null

  return supabase
}
```

- [ ] **Step 4: `app/fiscal/parametros/actions.ts` — remover `exigirSessaoAdmin()` e suas 12 chamadas**

Remover o import (linha 4):

```ts
import { getValidAdminSession } from '@/lib/admin-auth/server'
```

Remover a constante e a função inteira (linhas 16-21):

```ts
const ERRO_SESSAO_ADMIN = 'Acesso negado: sessão da área ADMIN expirada ou inválida.'

async function exigirSessaoAdmin(): Promise<string | null> {
  const session = await getValidAdminSession()
  return session ? null : ERRO_SESSAO_ADMIN
}
```

Remover as 12 ocorrências do bloco de 2 linhas no início de cada função exportada. O padrão é sempre um destes dois formatos — remover as duas linhas em cada uma das 12 funções (`salvarComunicado`, `atualizarPerfil`, `criarUsuario`, `deletarUsuario`, `salvarConfiguracoes`, `salvarTemplate`, `aplicarTemplateAClientes`, `salvarTemplateGrupo`, `aplicarTemplateGrupoAClientes`, `analisarParcelamentosDuplicados`, `limparParcelamentosDuplicados`, `verificarSenhaDev`):

```ts
  const erroAdmin = await exigirSessaoAdmin()
  if (erroAdmin) throw new Error(erroAdmin)
```

(em `salvarComunicado`, único caso que usa `throw` em vez de `return`)

ou, nas demais 11 funções, o formato é:

```ts
  const erroAdmin = await exigirSessaoAdmin()
  if (erroAdmin) return { error: erroAdmin }
```

(com o shape de retorno variando por função — ex. `{ error: erroAdmin, atualizados: 0, avisoForaCatalogo: [] }` em `aplicarTemplateAClientes`/`aplicarTemplateGrupoAClientes`, `{ error: erroAdmin, grupos: [] }` em `analisarParcelamentosDuplicados`, `{ ok: false, error: erroAdmin }` em `verificarSenhaDev`, `{ error: erroAdmin, gruposMesclados: 0, linhasRemovidas: 0 }` em `limparParcelamentosDuplicados`). Remover as duas linhas do bloco em cada uma das 12 funções, mantendo a checagem de `callerProfile?.role !== 'admin'` que já vem logo em seguida em cada uma — essa checagem não muda.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos nos 4 arquivos.

- [ ] **Step 6: Commit**

```bash
git add lib/config-entidades-actions.ts lib/tarefa-tipo-vinculos-actions.ts "app/(comum)/vinculos/actions.ts" "app/fiscal/parametros/actions.ts"
git commit -m "refactor: remove checagem de sessão ts_admin das Server Actions da seção ADMIN"
```

---

### Task 4: Apagar arquivos órfãos e verificar manualmente

**Files:**
- Delete: `app/admin/bloqueio/page.tsx`
- Delete: `app/admin/bloqueio/actions.ts`
- Delete: `app/admin/bloqueio/BloqueioForm.tsx`
- Delete: `lib/admin-auth/server.ts`
- Delete: `lib/admin-auth/session.ts`
- Delete: `lib/admin-auth/constants.ts`
- Delete: `components/admin/SairAdminButton.tsx`

**Interfaces:**
- Consumes: estado final das Tasks 1-3 (nenhum arquivo do projeto deve mais importar os arquivos acima).
- Produces: nada — última task.

- [ ] **Step 1: Confirmar que nada mais importa esses arquivos**

Run: `grep -rn "admin-auth\|SairAdminButton\|admin/bloqueio" --include="*.ts" --include="*.tsx" app lib components proxy.ts`
Expected: nenhuma ocorrência (fora dos próprios arquivos que serão apagados no Step 2). Se aparecer algo fora da lista de arquivos a apagar, parar e investigar antes de prosseguir — Tasks 1-3 devem ter removido todos os chamadores.

- [ ] **Step 2: Apagar os arquivos e a pasta vazia**

```bash
rm app/admin/bloqueio/page.tsx app/admin/bloqueio/actions.ts app/admin/bloqueio/BloqueioForm.tsx
rmdir app/admin/bloqueio
rm lib/admin-auth/server.ts lib/admin-auth/session.ts lib/admin-auth/constants.ts
rmdir lib/admin-auth
rm components/admin/SairAdminButton.tsx
```

Se `components/admin/` ficar vazia depois disso, remover a pasta também (`rmdir components/admin`).

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erros (confirma que o Next.js não tem nenhuma referência de rota quebrada para `/admin/bloqueio` nem import morto).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove telas e módulo da autenticação step-up ts_admin (não usada mais)"
```

- [ ] **Step 5: Verificação manual no navegador (dev)**

Rodar `npm run dev`, logar no portal de dev com um usuário `role='admin'` (ver credenciais em memória `reference_dev_test_users`) e confirmar:
- Acessar `/fiscal/parametros`, `/admin/configuracoes` e `/vinculos` entra direto, sem nenhuma tela de bloqueio nem banner amarelo.
- Deslogar e logar com um usuário sem `role='admin'`: acessar qualquer uma das 3 rotas redireciona para `/intranet`.
- Navegar manualmente para `/admin/bloqueio`: deve dar 404 (rota apagada).

Reportar o resultado ao usuário antes de considerar a task concluída.
