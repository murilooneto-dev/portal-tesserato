# Fundação Multi-Setor do Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a fundação de navegação e controle de acesso multi-setor do portal-tesserato — múltiplos setores por usuário, TopNav de troca de setor, Sidebar dividida em Comum/Setor-ativo, controle de acesso por setor no middleware, admin de usuários com setores, e placeholders para os 4 novos setores.

**Architecture:** Extrai um "shell" de portal compartilhado (`PortalShell` + `getPortalContext`) usado por todos os layouts de setor, para não duplicar a lógica de auth/perfil/mês-ano que hoje só existe em `app/fiscal/layout.tsx`. `TopNav` (hoje morto) vira o seletor de setor; `Sidebar` passa a receber o setor ativo como prop e mostra seção Comum + seção do setor. Setor ativo é: hardcoded pelo próprio layout de cada setor (`/fiscal/*` sempre passa `"fiscal"`), ou lido de um cookie (sem escrita em Server Component, só leitura) nas páginas comuns (`/intranet`, `/ferramentas`).

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + Auth), TypeScript, Tailwind v4.

## Global Constraints

- **NADA de `git push`, `gh pr create`, ou merge pra `main` neste trabalho** — tudo fica local na branch `feat/multi-setor-portal` até o usuário liberar explicitamente.
- Todo teste/verificação roda contra o banco de **dev** (`fcpcorqquovvgtoukxry`, via `.env.development.local` — já configurado e sincronizado). Nunca rodar migration ou seed contra produção (`qilwxzpxkjzbfrwlbydt`).
- Projeto **não tem suíte de testes automatizada** (sem Jest/Vitest configurado) — toda verificação de cada task é manual, no navegador (Browser pane), como já vem sendo feito nesta sessão. "Escrever teste" nas tasks abaixo significa "roteiro de verificação manual", não código de teste.
- Seguir os tokens de tema já existentes (`var(--fg)`, `var(--bg-surface)`, `var(--accent)`, etc.) — não introduzir cores fixas novas.
- Migrations do Supabase vão em `supabase/migrations/*.sql`, numeradas em sequência, aplicadas via `npx supabase db push --password 'Tesserato@123password'` (CLI já linkado ao projeto dev).

---

### Task 1: Migration `setor` → `setores` + tipos

**Files:**
- Create: `supabase/migrations/004_multi_setor.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `Profile.setores: UserSetor[]` (substitui `Profile.setor: UserSetor`); `export const SETORES: UserSetor[]`; `export const SETOR_LABEL: Record<UserSetor, string>`; `export const SETOR_HOME: Record<UserSetor, string>`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/004_multi_setor.sql

alter table profiles add column if not exists setores user_setor[];
update profiles set setores = array[setor] where setores is null;
alter table profiles alter column setores set not null;
alter table profiles alter column setores set default '{fiscal}';
alter table profiles drop column if exists setor;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, role, setores, cor)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operador'),
    coalesce(
      (select array_agg(x::user_setor) from jsonb_array_elements_text(new.raw_user_meta_data->'setores') as x),
      '{fiscal}'
    ),
    coalesce(new.raw_user_meta_data->>'cor', '#6366f1')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

- [ ] **Step 2: Aplicar no banco de dev**

Run: `cd "D:/DEV/Site Tesserato + Fiscal/portal-tesserato" && SUPABASE_ACCESS_TOKEN=sbp_9bc3c793265418cdb693c62e5231e04ea9a5aa46 npx supabase db push --password 'Tesserato@123password' --yes`

Expected: `Applying migration 004_multi_setor.sql...` seguido de `Finished supabase db push.`, sem erro.

- [ ] **Step 3: Verificar a coluna no dev**

Run (no SQL Editor do projeto dev, ou via `psql`): `select id, nome, setores from profiles;`
Expected: usuário `admin.dev@tesserato.local` aparece com `setores = {fiscal}`.

- [ ] **Step 4: Atualizar `lib/types.ts`**

```typescript
export type UserRole = 'admin' | 'operador'
export type UserSetor = 'fiscal' | 'contabil' | 'pessoal' | 'societario' | 'financeiro'
export type BotTipo = 'iss' | 'siga' | 'mei'
export type BotStatus = 'processado' | 'erro'

export const SETORES: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

export const SETOR_LABEL: Record<UserSetor, string> = {
  fiscal: 'Fiscal',
  contabil: 'Contábil',
  pessoal: 'Pessoal',
  societario: 'Societário',
  financeiro: 'Financeiro',
}

export const SETOR_HOME: Record<UserSetor, string> = {
  fiscal: '/fiscal/dashboard',
  contabil: '/contabil',
  pessoal: '/pessoal',
  societario: '/societario',
  financeiro: '/financeiro',
}

export interface Profile {
  id: string
  nome: string
  role: UserRole
  setores: UserSetor[]
  cor: string
  created_at: string
}
```

(mantém as demais interfaces do arquivo — `Cliente`, `Tarefa`, `LinkRapido`, `BotConfig`, `BotEvento` — sem alteração)

- [ ] **Step 5: Rodar o typecheck pra achar todo lugar que quebrou**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: erros em `app/page.tsx`, `app/fiscal/layout.tsx`, `components/fiscal/AdminUsuarios.tsx`, `app/fiscal/parametros/actions.ts`, `app/fiscal/parametros/ParametrosClient.tsx` (referenciando `.setor` singular) — são corrigidos nas próximas tasks. Confirmar que a lista de erros bate com esses 5 arquivos e não aparece nada inesperado.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/004_multi_setor.sql lib/types.ts
git commit -m "feat: migra profiles.setor para profiles.setores (array multi-setor)"
```

---

### Task 2: Shell compartilhado de portal (contexto + componente)

**Files:**
- Create: `lib/get-portal-context.ts`
- Create: `lib/setor-ativo.ts`
- Create: `lib/setor-ativo-server.ts`
- Create: `components/shell/PortalShell.tsx`

**Interfaces:**
- Consumes: `Profile`, `SETOR_HOME`, `SETORES` de `lib/types.ts` (Task 1); `MesAnoProvider` de `lib/mes-atual-context.tsx`; `Sidebar` de `components/fiscal/Sidebar.tsx` (ainda não modificado — só usado com a assinatura atual até a Task 4).
- Produces: `getPortalContext(): Promise<{ profile: Profile; mes: number; ano: number }>` (redireciona pra `/login` se não autenticado); `SETOR_ATIVO_COOKIE: string`; `getSetorAtivo(fallback: UserSetor): Promise<UserSetor>`; `<PortalShell profile ano mes setorAtivo>{children}</PortalShell>` (componente).

- [ ] **Step 1: Criar `lib/get-portal-context.ts`**

```typescript
// lib/get-portal-context.ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import type { Profile } from '@/lib/types'

export async function getPortalContext(): Promise<{ profile: Profile; mes: number; ano: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile: Profile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador',
    setores: ['fiscal'],
    cor: '#6366f1',
    created_at: new Date().toISOString(),
  }

  const { mes, ano } = await getMesAno()

  return { profile: safeProfile, mes, ano }
}
```

- [ ] **Step 2: Criar `lib/setor-ativo.ts`**

```typescript
// lib/setor-ativo.ts
import { SETORES, type UserSetor } from '@/lib/types'

export const SETOR_ATIVO_COOKIE = 'setor-ativo'

export function isUserSetor(value: string | undefined): value is UserSetor {
  return !!value && (SETORES as string[]).includes(value)
}
```

- [ ] **Step 3: Criar `lib/setor-ativo-server.ts`**

```typescript
// lib/setor-ativo-server.ts
import { cookies } from 'next/headers'
import { SETOR_ATIVO_COOKIE, isUserSetor } from '@/lib/setor-ativo'
import type { UserSetor } from '@/lib/types'

/** Lê o setor ativo salvo (cookie, escrito pelo TopNav ao trocar de aba), com fallback. */
export async function getSetorAtivo(fallback: UserSetor): Promise<UserSetor> {
  const cookieStore = await cookies()
  const valor = cookieStore.get(SETOR_ATIVO_COOKIE)?.value
  return isUserSetor(valor) ? valor : fallback
}
```

- [ ] **Step 4: Criar `components/shell/PortalShell.tsx`**

```typescript
// components/shell/PortalShell.tsx
import Sidebar from '@/components/fiscal/Sidebar'
import TopNav from '@/components/fiscal/TopNav'
import { MesAnoProvider } from '@/lib/mes-atual-context'
import type { Profile, UserSetor } from '@/lib/types'

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
  children: React.ReactNode
}

export default function PortalShell({ profile, mes, ano, setorAtivo, children }: Props) {
  const mostraTopNav = profile.role === 'admin' || profile.setores.length > 1

  return (
    <MesAnoProvider mes={mes} ano={ano}>
      <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-page)]">
        {mostraTopNav && <TopNav profile={profile} setorAtivo={setorAtivo} />}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar profile={profile} mes={mes} ano={ano} setorAtivo={setorAtivo} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </MesAnoProvider>
  )
}
```

Nota: `Sidebar` e `TopNav` ainda têm a assinatura antiga (sem `setorAtivo`) — isso quebra o typecheck até a Task 3, que reescreve os dois componentes juntos logo em seguida. Por ora, **pule o typecheck neste ponto** e prossiga.

- [ ] **Step 5: Commit**

```bash
git add lib/get-portal-context.ts lib/setor-ativo.ts lib/setor-ativo-server.ts components/shell/PortalShell.tsx
git commit -m "feat: adiciona shell de portal compartilhado (contexto + PortalShell)"
```

---

### Task 3: TopNav como seletor de setor + Sidebar dividida (Comum / setor ativo)

**Files:**
- Modify: `components/fiscal/TopNav.tsx` (reescreve o conteúdo — de barra de páginas pra seletor de setor)
- Modify: `components/fiscal/Sidebar.tsx`

**Interfaces:**
- Consumes: `Profile`, `SETORES`, `SETOR_LABEL`, `SETOR_HOME` de `lib/types.ts`; `SETOR_ATIVO_COOKIE` de `lib/setor-ativo.ts`.
- Produces: `<TopNav profile setorAtivo />`; `<Sidebar profile mes ano setorAtivo />` — ambos agora exigem a prop `setorAtivo: UserSetor`.

- [ ] **Step 1: Reescrever `components/fiscal/TopNav.tsx`**

```typescript
'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SETORES, SETOR_LABEL, SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { SETOR_ATIVO_COOKIE } from '@/lib/setor-ativo'

interface Props {
  profile: Profile
  setorAtivo: UserSetor
}

export default function TopNav({ profile, setorAtivo }: Props) {
  const router = useRouter()

  const setoresVisiveis = profile.role === 'admin' ? SETORES : profile.setores

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function trocarSetor(setor: UserSetor) {
    document.cookie = `${SETOR_ATIVO_COOKIE}=${setor}; path=/; max-age=${60 * 60 * 24 * 365}`
    router.push(SETOR_HOME[setor])
  }

  return (
    <header className="bg-[var(--bg-surface-2)] border-b border-[var(--fg)]/8 flex items-center gap-0 h-12 px-4 shrink-0 z-40">
      <div className="flex items-center gap-2 pr-4 border-r border-[var(--fg)]/8 shrink-0">
        <Image src="/logo.ico" alt="Tesserato" width={24} height={24} className="rounded-md" />
        <p className="text-[var(--fg)] text-xs font-bold tracking-wide">Tesserato</p>
      </div>

      <nav className="flex items-center gap-1 px-3 flex-1 overflow-x-auto">
        {setoresVisiveis.map(setor => (
          <button
            key={setor}
            onClick={() => trocarSetor(setor)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              setor === setorAtivo
                ? 'bg-[var(--accent)] text-[var(--fg)]'
                : 'text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/6'
            }`}
          >
            {SETOR_LABEL[setor]}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3 pl-4 border-l border-[var(--fg)]/8 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--fg)] text-[10px] font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {(profile.nome ?? 'U').charAt(0).toUpperCase()}
          </div>
          <span className="text-[var(--fg)]/70 text-sm">{profile.nome}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/70 px-2.5 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Reescrever `components/fiscal/Sidebar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserSetor } from '@/lib/types'
import { useTheme } from '@/lib/theme'
import MesSeletor from './MesSeletor'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, CreditCard, Wrench, Settings, ShieldCheck, ClipboardCheck,
  Sun, Moon,
  type LucideIcon,
} from 'lucide-react'

interface NavItem { href: string; label: string; icon: LucideIcon }

const ITENS_COMUNS: NavItem[] = [
  { href: '/intranet',   label: 'Intranet',   icon: Zap   },
  { href: '/ferramentas', label: 'Ferramentas', icon: Wrench },
]

const ITENS_POR_SETOR: Record<UserSetor, NavItem[]> = {
  fiscal: [
    { href: '/fiscal/dashboard',     label: 'Dashboard',     icon: LayoutGrid     },
    { href: '/fiscal/clientes',      label: 'Clientes',      icon: Users          },
    { href: '/fiscal/calendario',    label: 'Calendário',    icon: Calendar       },
    { href: '/fiscal/relatorios',    label: 'Relatórios',    icon: FileText       },
    { href: '/fiscal/historico',     label: 'Histórico',     icon: TrendingUp     },
    { href: '/fiscal/parcelamentos', label: 'Parcelamentos', icon: CreditCard     },
    { href: '/fiscal/conferencia',   label: 'Conferência',   icon: ClipboardCheck },
  ],
  contabil:   [{ href: '/contabil',   label: 'Em construção', icon: Wrench }],
  pessoal:    [{ href: '/pessoal',    label: 'Em construção', icon: Wrench }],
  societario: [{ href: '/societario', label: 'Em construção', icon: Wrench }],
  financeiro: [{ href: '/financeiro', label: 'Em construção', icon: Wrench }],
}

interface Props {
  profile: Profile
  mes: number
  ano: number
  setorAtivo: UserSetor
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
        active
          ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
          : 'text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/5'
      }`}
    >
      <item.icon size={15} strokeWidth={1.75} />
      {item.label}
    </Link>
  )
}

export default function Sidebar({ profile, mes, ano, setorAtivo }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="w-56 h-full shrink-0 border-r border-[var(--fg)]/7 flex flex-col overflow-y-auto"
      style={{
        backgroundImage: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-page) 100%), radial-gradient(circle, rgba(0,204,235,0.045) 1px, transparent 1px)',
        backgroundSize: 'auto, 18px 18px',
      }}
    >
      <div className="px-4 py-4 border-b border-[var(--fg)]/7">
        <MesSeletor mes={mes} ano={ano} />
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">Comum</p>
        {ITENS_COMUNS.map(item => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}

        <div className="my-2 border-t border-[var(--fg)]/8" />
        <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">
          {setorAtivo === 'fiscal' ? 'Fiscal' : setorAtivo}
        </p>
        {ITENS_POR_SETOR[setorAtivo].map(item => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}

        {profile.role === 'admin' && (
          <>
            <div className="my-2 border-t border-[var(--fg)]/8" />
            <p className="px-3 text-[var(--fg)]/20 text-[10px] uppercase tracking-wider mb-1">Admin</p>
            <NavLink item={{ href: '/fiscal/parametros', label: 'Parâmetros', icon: Settings }} active={pathname.startsWith('/fiscal/parametros')} />
            <NavLink item={{ href: '/fiscal/admin', label: 'Admin', icon: ShieldCheck }} active={pathname.startsWith('/fiscal/admin')} />
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--fg)]/8">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 text-left text-[var(--fg)]/40 hover:text-[var(--fg)]/70 text-xs transition-colors px-1 py-1.5 mb-2"
        >
          {theme === 'light' ? <Moon size={13} strokeWidth={1.75} /> : <Sun size={13} strokeWidth={1.75} />}
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--fg)] text-xs font-bold"
            style={{ backgroundColor: profile.cor }}
          >
            {(profile.nome ?? 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--fg)] text-sm font-medium truncate">{profile.nome}</p>
            <p className="text-[var(--fg)]/30 text-xs capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-[var(--fg)]/30 text-xs hover:text-[var(--fg)]/60 transition-colors px-1"
        >
          Sair →
        </button>
      </div>
    </aside>
  )
}
```

Nota: o bloco de logo "Tesserato / Setor Fiscal" que existia no topo do Sidebar foi removido daqui porque o TopNav (quando visível) já mostra a logo; em quem só tem 1 setor (sem TopNav), o Sidebar fica sem logo por enquanto — aceitável pra esta fundação (visual polish fica pra depois se o usuário achar necessário).

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: erros restantes só em `app/fiscal/layout.tsx` (ainda não usa `PortalShell`), `app/page.tsx`, `components/fiscal/AdminUsuarios.tsx`, `app/fiscal/parametros/actions.ts`, `app/fiscal/parametros/ParametrosClient.tsx` — resolvidos nas próximas tasks.

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/TopNav.tsx components/fiscal/Sidebar.tsx
git commit -m "feat: TopNav vira seletor de setor, Sidebar dividida em Comum/setor ativo"
```

---

### Task 4: Fiscal usa o novo shell + verificação visual

**Files:**
- Modify: `app/fiscal/layout.tsx`

**Interfaces:**
- Consumes: `getPortalContext()` (Task 2), `PortalShell` (Task 2).

- [ ] **Step 1: Reescrever `app/fiscal/layout.tsx`**

```typescript
import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="fiscal">
      {children}
    </PortalShell>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: só erros em `app/page.tsx`, `components/fiscal/AdminUsuarios.tsx`, `app/fiscal/parametros/actions.ts`, `app/fiscal/parametros/ParametrosClient.tsx` (Task 6).

- [ ] **Step 3: Verificação manual no navegador**

1. `preview_start` com a config `dev` (usa `.env.development.local` automaticamente).
2. Login com `admin.dev@tesserato.local` / `DevAdmin@123`.
3. Navegar pra `/fiscal/clientes` — confirmar que a página carrega igual a antes (mostra "Empresa Teste Dev LTDA").
4. Confirmar que o **TopNav aparece** no topo (esse usuário é admin, então sempre aparece) com a aba "Fiscal" destacada.
5. Confirmar que a Sidebar mostra "Comum" (Intranet, Ferramentas) e "Fiscal" (Dashboard, Clientes, Calendário, Relatórios, Histórico, Parcelamentos, **Conferência**) — Conferência é novidade, não existia no menu antes.
6. Clicar em "Intranet" na Sidebar — vai dar 404 por enquanto (rota ainda não movida, só existe em `/fiscal/intranet`) — **esperado nesta task**, corrigido na Task 6.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/layout.tsx
git commit -m "feat: app/fiscal usa o PortalShell compartilhado"
```

---

### Task 5: Controle de acesso por setor no middleware + simplifica redirect raiz

**Files:**
- Modify: `proxy.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `SETOR_HOME` de `lib/types.ts`.

- [ ] **Step 1: Adicionar checagem de setor em `proxy.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SETOR_HOME, type UserSetor } from '@/lib/types'

const PREFIXOS_SETOR: UserSetor[] = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/logo.ico'
  ) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const setorDaRota = PREFIXOS_SETOR.find(s => pathname.startsWith(`/${s}`))
  if (setorDaRota) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setores, role')
      .eq('id', user.id)
      .single()

    const podeAcessar = profile?.role === 'admin' || (profile?.setores ?? []).includes(setorDaRota)

    if (!podeAcessar) {
      const primeiroSetor = (profile?.setores?.[0] ?? 'fiscal') as UserSetor
      return NextResponse.redirect(new URL(SETOR_HOME[primeiroSetor], request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|logo\\.ico|logo\\.png).*)'],
}
```

- [ ] **Step 2: Simplificar `app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/intranet')
}
```

(o `proxy.ts` já garante que só chega aqui autenticado — não precisa mais buscar perfil pra decidir setor, já que Intranet agora é comum a todos)

- [ ] **Step 3: Verificação manual**

1. Logado como `admin.dev@tesserato.local`, navegar direto pra `http://localhost:3000/contabil` — deve carregar normalmente (é admin, acesso liberado a todos os setores) mesmo a página ainda não existindo de verdade (vai dar 404 do Next.js por rota inexistente, não redirect de acesso negado — **isso é esperado**, a rota só é criada na Task 7; o importante aqui é confirmar que NÃO houve redirect de "acesso negado" pro admin).
2. Navegar pra `http://localhost:3000/` — deve cair em `/intranet` (que ainda dá 404 até a Task 6 — esperado).

- [ ] **Step 4: Commit**

```bash
git add proxy.ts app/page.tsx
git commit -m "feat: controle de acesso por setor no middleware"
```

---

### Task 6: Intranet e Ferramentas viram rotas comuns

**Files:**
- Create: `app/(comum)/layout.tsx`
- Create: `app/(comum)/intranet/page.tsx` (movido de `app/fiscal/intranet/page.tsx`)
- Create: `app/(comum)/ferramentas/page.tsx` (movido de `app/fiscal/ferramentas/page.tsx`)
- Create: `app/(comum)/ferramentas/FerramentasClient.tsx` (movido de `app/fiscal/ferramentas/FerramentasClient.tsx`)
- Delete: `app/fiscal/intranet/page.tsx`, `app/fiscal/ferramentas/page.tsx`, `app/fiscal/ferramentas/FerramentasClient.tsx`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `getPortalContext()`, `PortalShell`, `getSetorAtivo()`.

- [ ] **Step 1: Criar `app/(comum)/layout.tsx`**

```typescript
import { getPortalContext } from '@/lib/get-portal-context'
import { getSetorAtivo } from '@/lib/setor-ativo-server'
import PortalShell from '@/components/shell/PortalShell'

export default async function ComumLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()
  const setorAtivo = await getSetorAtivo(profile.setores[0] ?? 'fiscal')

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo={setorAtivo}>
      {children}
    </PortalShell>
  )
}
```

- [ ] **Step 2: Mover Intranet**

```bash
mkdir -p "app/(comum)/intranet"
git mv app/fiscal/intranet/page.tsx "app/(comum)/intranet/page.tsx"
```

Conteúdo do arquivo não muda (já é auto-contido, só usa `@/lib/supabase/server` e componentes com import absoluto).

- [ ] **Step 3: Mover Ferramentas**

```bash
mkdir -p "app/(comum)/ferramentas"
git mv app/fiscal/ferramentas/page.tsx "app/(comum)/ferramentas/page.tsx"
git mv app/fiscal/ferramentas/FerramentasClient.tsx "app/(comum)/ferramentas/FerramentasClient.tsx"
```

Em `app/(comum)/ferramentas/page.tsx`, confirmar que o import `import FerramentasClient from './FerramentasClient'` continua igual (caminho relativo, não muda).

- [ ] **Step 4: Remover as pastas antigas vazias**

```bash
rmdir app/fiscal/intranet app/fiscal/ferramentas
```

- [ ] **Step 5: Adicionar redirects em `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      { source: '/fiscal/intranet', destination: '/intranet', permanent: true },
      { source: '/fiscal/ferramentas', destination: '/ferramentas', permanent: true },
    ]
  },
}

export default nextConfig;
```

- [ ] **Step 6: Verificação manual**

1. Reiniciar o dev server (mudança em `next.config.ts` exige restart).
2. Navegar pra `http://localhost:3000/` — deve cair em `/intranet` e carregar normalmente (mostrando agenda pessoal + links rápidos).
3. Navegar pra `http://localhost:3000/fiscal/intranet` (URL antiga) — deve redirecionar pra `/intranet`.
4. Navegar pra `http://localhost:3000/fiscal/ferramentas` (URL antiga) — deve redirecionar pra `/ferramentas`.
5. Na Sidebar, clicar em "Intranet" e "Ferramentas" — devem funcionar sem 404.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Intranet e Ferramentas viram rotas comuns fora de /fiscal"
```

---

### Task 7: Placeholders dos 4 novos setores

**Files:**
- Create: `app/contabil/layout.tsx`, `app/contabil/page.tsx`
- Create: `app/pessoal/layout.tsx`, `app/pessoal/page.tsx`
- Create: `app/societario/layout.tsx`, `app/societario/page.tsx`
- Create: `app/financeiro/layout.tsx`, `app/financeiro/page.tsx`

**Interfaces:**
- Consumes: `getPortalContext()`, `PortalShell`.

- [ ] **Step 1: Criar o layout e a página do Contábil**

```typescript
// app/contabil/layout.tsx
import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function ContabilLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="contabil">
      {children}
    </PortalShell>
  )
}
```

```typescript
// app/contabil/page.tsx
export const metadata = { title: 'Contábil — Tesserato' }

export default function ContabilPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto text-center mt-20">
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-2">Setor Contábil</h1>
      <p className="text-[var(--fg)]/50">Em construção — as telas deste setor chegam em breve.</p>
    </div>
  )
}
```

- [ ] **Step 2: Criar o layout e a página do Pessoal**

```typescript
// app/pessoal/layout.tsx
import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function PessoalLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="pessoal">
      {children}
    </PortalShell>
  )
}
```

```typescript
// app/pessoal/page.tsx
export const metadata = { title: 'Pessoal — Tesserato' }

export default function PessoalPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto text-center mt-20">
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-2">Setor Pessoal</h1>
      <p className="text-[var(--fg)]/50">Em construção — as telas deste setor chegam em breve.</p>
    </div>
  )
}
```

- [ ] **Step 3: Criar o layout e a página do Societário**

```typescript
// app/societario/layout.tsx
import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function SocietarioLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="societario">
      {children}
    </PortalShell>
  )
}
```

```typescript
// app/societario/page.tsx
export const metadata = { title: 'Societário — Tesserato' }

export default function SocietarioPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto text-center mt-20">
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-2">Setor Societário</h1>
      <p className="text-[var(--fg)]/50">Em construção — as telas deste setor chegam em breve.</p>
    </div>
  )
}
```

- [ ] **Step 4: Criar o layout e a página do Financeiro**

```typescript
// app/financeiro/layout.tsx
import { getPortalContext } from '@/lib/get-portal-context'
import PortalShell from '@/components/shell/PortalShell'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const { profile, mes, ano } = await getPortalContext()

  return (
    <PortalShell profile={profile} mes={mes} ano={ano} setorAtivo="financeiro">
      {children}
    </PortalShell>
  )
}
```

```typescript
// app/financeiro/page.tsx
export const metadata = { title: 'Financeiro — Tesserato' }

export default function FinanceiroPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto text-center mt-20">
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-2">Setor Financeiro</h1>
      <p className="text-[var(--fg)]/50">Em construção — as telas deste setor chegam em breve.</p>
    </div>
  )
}
```

- [ ] **Step 5: Rodar o typecheck completo**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: só erros restantes em `components/fiscal/AdminUsuarios.tsx`, `app/fiscal/parametros/actions.ts`, `app/fiscal/parametros/ParametrosClient.tsx` (Task 8).

- [ ] **Step 6: Commit**

```bash
git add app/contabil app/pessoal app/societario app/financeiro
git commit -m "feat: placeholders dos setores Contábil, Pessoal, Societário e Financeiro"
```

---

### Task 8: Admin de usuários com múltiplos setores

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`
- Modify: `components/fiscal/AdminUsuarios.tsx`

**Interfaces:**
- Consumes: `SETORES`, `SETOR_LABEL` de `lib/types.ts`.
- Produces: `criarUsuario(payload: { nome, login, senha, role, cor, abas, setores: string[] })`; `atualizarPerfil(id, formData)` continua aceitando `setores` via `FormData` (múltiplos valores no mesmo campo).

- [ ] **Step 1: Atualizar `criarUsuario` em `app/fiscal/parametros/actions.ts`**

```typescript
export async function criarUsuario(payload: {
  nome: string
  login: string
  senha: string
  role: string
  cor: string
  abas: string[]
  setores: string[]
}): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: payload.login,
    password: payload.senha,
    email_confirm: true,
  })
  if (authErr) return { error: authErr.message }

  const userId = authData.user.id

  const { error: profErr } = await admin.from('profiles').update({
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setores: payload.setores.length > 0 ? payload.setores : ['fiscal'],
    abas_acesso: payload.abas,
  }).eq('id', userId)

  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { error: profErr.message }
  }

  revalidatePath('/fiscal/parametros')
  return {}
}
```

(mantém o resto do arquivo — `salvarComunicado`, `salvarConfiguracoes`, `salvarTemplate`, etc. — sem alteração)

- [ ] **Step 2: Atualizar `atualizarPerfil` no mesmo arquivo pra aceitar setores**

```typescript
export async function atualizarPerfil(id: string, formData: FormData) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) throw new Error('Não autorizado.')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') throw new Error('Acesso negado.')

  const setores = formData.getAll('setores') as string[]

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: formData.get('nome') as string,
      role: formData.get('role') as string,
      cor:  formData.get('cor')  as string,
      setores: setores.length > 0 ? setores : ['fiscal'],
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}
```

- [ ] **Step 3: Adicionar state + checkboxes de setores no formulário "Novo Usuário" em `ParametrosClient.tsx`**

Adicionar perto de `const [novoAbas, setNovoAbas] = useState<string[]>([...ABAS])` (linha ~110):

```typescript
const [novoSetores, setNovoSetores] = useState<string[]>(['fiscal'])
```

Adicionar import no topo do arquivo: `import { SETORES, SETOR_LABEL } from '@/lib/types'`

Adicionar uma função de toggle perto de `toggleAba` (procurar sua definição no arquivo e replicar o padrão):

```typescript
function toggleSetor(setor: string) {
  setNovoSetores(prev => prev.includes(setor) ? prev.filter(s => s !== setor) : [...prev, setor])
}
```

No `handleCriarUsuario`, incluir `setores: novoSetores` no payload passado pra `criarUsuario(...)`, e resetar com `setNovoSetores(['fiscal'])` no bloco de sucesso (junto dos outros `setNovo*`).

No JSX, logo depois do bloco `<label className={labelCls}>Acesso às Abas</label>...` (por volta da linha 674-685), adicionar:

```tsx
<div>
  <label className={labelCls}>Setores</label>
  <div className="grid grid-cols-2 gap-2">
    {SETORES.map(setor => (
      <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={novoSetores.includes(setor)} onChange={() => toggleSetor(setor)}
          className="w-3.5 h-3.5 accent-[var(--accent)]" />
        <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
      </label>
    ))}
  </div>
</div>
```

Remover a linha `<p className="text-[var(--fg)]/20 text-xs text-center">Usuários criados aqui têm acesso apenas ao setor fiscal.</p>` (não é mais verdade).

- [ ] **Step 4: Adicionar edição de setores no painel "Usuários Cadastrados"**

No bloco de edição inline (por volta da linha 723, dentro do `isEditing ? (...)`), adicionar os checkboxes de setor usando o mesmo padrão de `profileEdits`:

```tsx
<div className="grid grid-cols-2 gap-2">
  {SETORES.map(setor => (
    <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={(edits.setores ?? p.setores).includes(setor)}
        onChange={() => {
          const atual = edits.setores ?? p.setores
          const novo = atual.includes(setor) ? atual.filter(s => s !== setor) : [...atual, setor]
          setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], setores: novo } }))
        }}
        className="w-3.5 h-3.5 accent-[var(--accent)]"
      />
      <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
    </label>
  ))}
</div>
```

Na função `handleSaveProfile` (procurar sua definição no arquivo — monta um `FormData` a partir de `edits`/`p`), garantir que ela envie `setores` como múltiplos campos `formData.append('setores', s)` pra cada setor, já que `atualizarPerfil` lê via `formData.getAll('setores')`.

No trecho de exibição (linha ~758, `<p>{p.setor ?? 'fiscal'} · {p.role}</p>`), trocar para:

```tsx
<p className="text-[var(--fg)]/35 text-xs mt-0.5">{p.setores.map(s => SETOR_LABEL[s]).join(', ')} · {p.role}</p>
```

- [ ] **Step 5: Atualizar `components/fiscal/AdminUsuarios.tsx`**

```typescript
import type { Profile } from '@/lib/types'
import { SETOR_LABEL } from '@/lib/types'

// ... (resto do arquivo igual, trocar apenas a linha:)
<p className="text-[var(--fg)]/30 text-xs capitalize mt-0.5">{p.setores.map(s => SETOR_LABEL[s]).join(', ')}</p>
```

- [ ] **Step 6: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem nenhum erro.

- [ ] **Step 7: Verificação manual**

1. Logado como `admin.dev@tesserato.local`, ir em `/fiscal/parametros`.
2. Criar um usuário novo marcando os setores "Fiscal" e "Contábil".
3. Deslogar, logar com o usuário novo.
4. Confirmar que o **TopNav aparece** (tem 2 setores) mostrando só as abas "Fiscal" e "Contábil" (não as 5).
5. Clicar na aba "Contábil" — deve navegar pra `/contabil` e mostrar "Em construção".
6. Voltar pro admin, editar esse usuário removendo "Contábil" — deslogar/logar de novo com ele, confirmar que o TopNav some (voltou a ter só 1 setor).

- [ ] **Step 8: Commit**

```bash
git add app/fiscal/parametros/actions.ts app/fiscal/parametros/ParametrosClient.tsx components/fiscal/AdminUsuarios.tsx
git commit -m "feat: admin de usuarios suporta multiplos setores"
```

---

### Task 9: Verificação manual completa (checklist do spec)

**Files:** nenhum arquivo novo — só roteiro de verificação.

- [ ] **Step 1: Criar usuários de teste adicionais no banco de dev**

Usar o formulário de criação em `/fiscal/parametros` (já funcionando pós-Task 8) pra criar:
- `mono-setor.dev@tesserato.local` / senha à sua escolha — só setor Fiscal.
- `multi-setor.dev@tesserato.local` — setores Fiscal + Societário.

- [ ] **Step 2: Rodar cada item do checklist do spec**

1. **Usuário mono-setor (Fiscal):** logar com `mono-setor.dev@tesserato.local` — confirmar que o TopNav **não aparece**, portal idêntico ao de antes desta mudança.
2. **Usuário multi-setor:** logar com `multi-setor.dev@tesserato.local` — TopNav aparece com Fiscal e Societário; trocar de aba muda a Sidebar (seção "Fiscal" vs "Societário") e navega pra home certa.
3. **Acesso negado via URL direta:** logado como `mono-setor.dev@tesserato.local`, tentar acessar `http://localhost:3000/contabil` direto na URL — deve redirecionar pra `/fiscal/dashboard` (único setor dele).
4. **Admin vê tudo:** logado como `admin.dev@tesserato.local` (setores no banco = só `{fiscal}`), confirmar que o TopNav mostra as 5 abas mesmo assim.
5. **Criação de usuário:** já validado na Task 8, Step 7.
6. **Redirects antigos:** `/fiscal/intranet` e `/fiscal/ferramentas` redirecionam certo (Task 6, Step 6 — reconfirmar aqui).
7. **Conferência no menu:** confirmar visualmente que "Conferência" aparece na Sidebar do setor Fiscal e o link funciona (Task 4, Step 3).

- [ ] **Step 3: Rodar o typecheck final do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Reportar ao usuário**

Resumir no chat quais dos 7 itens acima passaram, com prints/observações de qualquer coisa que destoou do esperado. **Não fazer push nem abrir PR** — a branch fica local aguardando o usuário decidir os próximos passos, conforme o Global Constraint deste plano.
