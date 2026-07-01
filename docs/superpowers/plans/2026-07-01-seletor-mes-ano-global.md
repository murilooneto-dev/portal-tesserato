# Seletor Global de Mês/Ano Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um seletor de mês/ano no Sidebar que controla, via cookie de sessão, quais dados aparecem em Dashboard, Clientes, Tarefas, Relatórios, Histórico e Parcelamentos.

**Architecture:** Um cookie `mes_selecionado` (não-httpOnly, expira ao fechar o navegador) guarda `"MM-YYYY"`. Páginas Server Component (Dashboard, Clientes, Tarefas) leem o cookie via `next/headers` em `lib/mes-atual-server.ts`. Páginas Client Component (Relatórios, Histórico, Parcelamentos) leem o mesmo cookie via `document.cookie` em `lib/mes-atual-cliente.ts`, num `useEffect` que roda uma vez no mount. Um componente `MesSeletor` (client) no Sidebar troca o cookie via server action e chama `router.refresh()`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (`@supabase/ssr`), Tailwind CSS.

**Nota de escopo (descoberta durante o planejamento, revisando o design aprovado):**
- `historico/page.tsx` e `parcelamentos/page.tsx` não filtram dados por mês — mostram o ano inteiro (12 colunas). Por isso, para essas duas páginas, só o **ano** selecionado importa de fato (histórico usa o mês só para destacar visualmente a coluna "atual"; parcelamentos usa o ano só como rótulo/título, sem filtrar a query).
- Em `dashboard/page.tsx`, a seção de "Alertas de vencimento" compara a data selecionada com o relógio real (`hoje`). Isso só faz sentido quando o mês/ano selecionado é o mês/ano real atual — então essa seção passa a ficar oculta quando o admin estiver navegando por outro mês.
- O cookie **não pode ser `httpOnly`**, porque as 3 páginas client-side precisam lê-lo via `document.cookie` (elas fazem fetch dentro de `useEffect`, sem um wrapper Server Component que possa passar a prop).

---

### Task 1: Helpers compartilhados de mês/ano

**Files:**
- Create: `lib/mes-atual.ts`
- Create: `lib/mes-atual-server.ts`
- Create: `lib/mes-atual-actions.ts`
- Create: `lib/mes-atual-cliente.ts`

- [ ] **Step 1: Criar `lib/mes-atual.ts`** com as constantes e funções puras, sem `next/headers` nem `document` — importável tanto por Server quanto por Client Components.

```typescript
// lib/mes-atual.ts

export const MES_COOKIE = 'mes_selecionado'

/** Mês/ano reais, calculados no fuso de São Paulo (independe do cookie). */
export function getMesAnoRealAgora(): { mes: number; ano: number } {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return { mes: agora.getMonth() + 1, ano: agora.getFullYear() }
}

/** Faz o parse do valor do cookie "MM-YYYY". Retorna null se ausente ou inválido. */
export function parseMesAnoCookie(valor: string | undefined | null): { mes: number; ano: number } | null {
  if (!valor) return null
  const [mesStr, anoStr] = valor.split('-')
  const mes = parseInt(mesStr, 10)
  const ano = parseInt(anoStr, 10)
  if (mes >= 1 && mes <= 12 && ano > 2000 && ano < 3000) {
    return { mes, ano }
  }
  return null
}
```

- [ ] **Step 2: Criar `lib/mes-atual-server.ts`** — helper para Server Components (Dashboard, Clientes, Tarefas).

```typescript
// lib/mes-atual-server.ts

import { cookies } from 'next/headers'
import { MES_COOKIE, getMesAnoRealAgora, parseMesAnoCookie } from './mes-atual'

/** Lê o mês/ano selecionado (cookie de sessão) com fallback pro mês/ano real. */
export async function getMesAno(): Promise<{ mes: number; ano: number }> {
  const cookieStore = await cookies()
  const parsed = parseMesAnoCookie(cookieStore.get(MES_COOKIE)?.value)
  return parsed ?? getMesAnoRealAgora()
}
```

- [ ] **Step 3: Criar `lib/mes-atual-actions.ts`** — server action que grava o cookie.

```typescript
// lib/mes-atual-actions.ts

'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { MES_COOKIE } from './mes-atual'

export async function definirMesAno(mes: number, ano: number): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(MES_COOKIE, `${mes}-${ano}`, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    // sem maxAge/expires -> cookie de sessão, some ao fechar o navegador
  })
  revalidatePath('/fiscal', 'layout')
}
```

- [ ] **Step 4: Criar `lib/mes-atual-cliente.ts`** — helper para Client Components (Relatórios, Histórico, Parcelamentos).

```typescript
// lib/mes-atual-cliente.ts

import { MES_COOKIE, getMesAnoRealAgora, parseMesAnoCookie } from './mes-atual'

/** Lê o cookie via document.cookie. Só funciona no browser (guard pra SSR). */
export function getMesAnoCliente(): { mes: number; ano: number } {
  if (typeof document === 'undefined') return getMesAnoRealAgora()
  const match = document.cookie.match(new RegExp(`(?:^|; )${MES_COOKIE}=([^;]*)`))
  const parsed = parseMesAnoCookie(match ? decodeURIComponent(match[1]) : null)
  return parsed ?? getMesAnoRealAgora()
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros nos 4 arquivos novos (podem aparecer erros pré-existentes em outros arquivos — ignorar, serão corrigidos nas próximas tasks).

- [ ] **Step 6: Commit**

```bash
git add lib/mes-atual.ts lib/mes-atual-server.ts lib/mes-atual-actions.ts lib/mes-atual-cliente.ts
git commit -m "feat: helpers de mes/ano global (cookie de sessao)"
```

---

### Task 2: Componente `MesSeletor` + integração no Sidebar e layout

**Files:**
- Create: `components/fiscal/MesSeletor.tsx`
- Modify: `components/fiscal/Sidebar.tsx`
- Modify: `app/fiscal/layout.tsx`

- [ ] **Step 1: Criar `components/fiscal/MesSeletor.tsx`**

```tsx
// components/fiscal/MesSeletor.tsx

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirMesAno } from '@/lib/mes-atual-actions'

const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  mes: number
  ano: number
}

export default function MesSeletor({ mes, ano }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function trocar(novoMes: number, novoAno: number) {
    startTransition(async () => {
      await definirMesAno(novoMes, novoAno)
      router.refresh()
    })
  }

  function anterior() {
    if (mes === 1) trocar(12, ano - 1)
    else trocar(mes - 1, ano)
  }

  function proximo() {
    if (mes === 12) trocar(1, ano + 1)
    else trocar(mes + 1, ano)
  }

  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/8">
      <button
        onClick={anterior}
        disabled={isPending}
        className="text-white/40 hover:text-white transition-colors px-1.5 disabled:opacity-30"
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <span className="text-white/70 text-[11px] font-medium whitespace-nowrap">
        {MESES_ABR[mes - 1]} · {ano}
      </span>
      <button
        onClick={proximo}
        disabled={isPending}
        className="text-white/40 hover:text-white transition-colors px-1.5 disabled:opacity-30"
        aria-label="Próximo mês"
      >
        ›
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar prop `mes`/`ano` e renderizar `MesSeletor` no `Sidebar.tsx`**

Modificar `components/fiscal/Sidebar.tsx:1-30` (imports e assinatura):

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import MesSeletor from './MesSeletor'
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, TrendingUp, Building2, CreditCard, Wrench, Settings, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

interface NavItem { href: string; label: string; icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { href: '/fiscal/intranet',      label: 'Intranet',      icon: Zap        },
  { href: '/fiscal/dashboard',     label: 'Dashboard',     icon: LayoutGrid },
  { href: '/fiscal/clientes',      label: 'Clientes',      icon: Users      },
  { href: '/fiscal/calendario',    label: 'Calendário',    icon: Calendar   },
  { href: '/fiscal/relatorios',    label: 'Relatórios',    icon: FileText   },
  { href: '/fiscal/historico',     label: 'Histórico',     icon: TrendingUp },
  { href: '/fiscal/empresas',      label: 'Empresas',      icon: Building2  },
  { href: '/fiscal/parcelamentos', label: 'Parcelamentos', icon: CreditCard },
  { href: '/fiscal/ferramentas',   label: 'Ferramentas',   icon: Wrench     },
]

interface Props {
  profile: Profile
  mes: number
  ano: number
}

export default function Sidebar({ profile, mes, ano }: Props) {
```

Modificar o bloco de cabeçalho (`components/fiscal/Sidebar.tsx:50-65`, o `<div className="px-4 py-4 border-b border-white/7">`) para incluir o seletor abaixo do logo:

```tsx
      <div className="px-4 py-4 border-b border-white/7">
        <div className="flex items-center gap-2.5 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Tesserato"
            width={32}
            height={32}
            className="rounded-lg shrink-0"
          />
          <div>
            <p className="text-white text-xs font-bold tracking-wide leading-tight">Tesserato</p>
            <p className="text-white/30 text-[10px] leading-tight">Setor Fiscal</p>
          </div>
        </div>
        <MesSeletor mes={mes} ano={ano} />
      </div>
```

(Nota: o `<div className="flex items-center gap-2.5">` original ganha `mb-3` para dar espaço ao seletor abaixo.)

- [ ] **Step 3: Passar `mes`/`ano` para o `Sidebar` em `app/fiscal/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/fiscal/Sidebar'
import { getMesAno } from '@/lib/mes-atual-server'

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador' as const,
    cor: '#6366f1',
    setor: 'fiscal' as const,
    created_at: new Date().toISOString(),
  }

  const { mes, ano } = await getMesAno()

  return (
    <div className="flex h-screen overflow-hidden bg-[#111e3a]">
      <Sidebar profile={safeProfile} mes={mes} ano={ano} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem novos erros relacionados a `Sidebar`, `MesSeletor` ou `layout.tsx`.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`, abrir `http://localhost:3000/fiscal/dashboard`.
Esperado: aparece "Jun · 2026" (ou mês atual) abaixo do logo no Sidebar, com setas ‹ › clicáveis. Clicar em ‹ deve trocar para "Mai · 2026" sem recarregar a página inteira (sem piscar o Sidebar).

- [ ] **Step 6: Commit**

```bash
git add components/fiscal/MesSeletor.tsx components/fiscal/Sidebar.tsx app/fiscal/layout.tsx
git commit -m "feat: seletor global de mes/ano no sidebar"
```

---

### Task 3: Dashboard lê o mês/ano global

**Files:**
- Modify: `app/fiscal/dashboard/page.tsx`

- [ ] **Step 1: Trocar a função local `getMesAno()` pelo helper compartilhado**

Remover de `app/fiscal/dashboard/page.tsx:7-10`:

```tsx
function getMesAno() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return { mes: now.getMonth() + 1, ano: now.getFullYear(), hoje: now }
}
```

Adicionar no topo do arquivo (junto aos imports, `app/fiscal/dashboard/page.tsx:1-3`):

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Cliente, Profile, Tarefa } from '@/lib/types'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
```

- [ ] **Step 2: Atualizar o corpo do componente (`app/fiscal/dashboard/page.tsx:42-77`)**

Trocar:

```tsx
export default async function DashboardPage() {
  const supabase = await createClient()
  const { mes, ano, hoje } = getMesAno()
```

por:

```tsx
export default async function DashboardPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()
```

E trocar o cálculo de `alertas` (`app/fiscal/dashboard/page.tsx:72-77`) — de:

```tsx
  const alertas = OBRIGACOES_CAL.map(ob => {
    const diaNum = ob.dia === -1 ? ultimoDia : ob.dia
    const due  = new Date(ano, mes - 1, diaNum)
    const diff = Math.ceil((due.getTime() - hoje.getTime()) / 86400000)
    return { ...ob, diaNum, diff }
  }).filter(a => a.diff >= 0 && a.diff <= 10)
```

para:

```tsx
  const alertas = ehMesAtual
    ? OBRIGACOES_CAL.map(ob => {
        const diaNum = ob.dia === -1 ? ultimoDia : ob.dia
        const due  = new Date(ano, mes - 1, diaNum)
        const diff = Math.ceil((due.getTime() - hoje.getTime()) / 86400000)
        return { ...ob, diaNum, diff }
      }).filter(a => a.diff >= 0 && a.diff <= 10)
    : []
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/dashboard/page.tsx`.

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/dashboard` no mês atual → seção "Alertas" aparece normalmente (se houver vencimento nos próximos 10 dias). Trocar o mês no Sidebar para o mês anterior → seção "Alertas" some, e "Progresso Geral" / listas passam a refletir os dados do mês anterior.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/dashboard/page.tsx
git commit -m "feat: dashboard usa o mes/ano selecionado globalmente"
```

---

### Task 4: Clientes lê o mês/ano global

**Files:**
- Modify: `app/fiscal/clientes/page.tsx`

- [ ] **Step 1: Trocar o cálculo de `hoje`/`mes`/`ano`**

Adicionar import no topo (`app/fiscal/clientes/page.tsx:1-2`):

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
```

Trocar (`app/fiscal/clientes/page.tsx:15-17`):

```tsx
  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()
```

por:

```tsx
  const { mes, ano } = await getMesAno()
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/clientes/page.tsx`.

- [ ] **Step 3: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/clientes`, trocar o mês no Sidebar, confirmar que as barras de progresso de cada cliente mudam de acordo com o mês selecionado.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/clientes/page.tsx
git commit -m "feat: pagina de clientes usa o mes/ano selecionado globalmente"
```

---

### Task 5: Tarefas lê o mês/ano global

**Files:**
- Modify: `app/fiscal/tarefas/page.tsx`

- [ ] **Step 1: Trocar o cálculo de `hoje`/`mes`/`ano`**

Adicionar import (`app/fiscal/tarefas/page.tsx:1-3`):

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
```

Trocar (`app/fiscal/tarefas/page.tsx:12-14`):

```tsx
  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()
```

por:

```tsx
  const { mes, ano } = await getMesAno()
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/tarefas/page.tsx`.

- [ ] **Step 3: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/tarefas`, trocar o mês no Sidebar, confirmar que a lista de clientes e o `{concluidas}/{total}` mudam de acordo com o mês selecionado, e que o subtítulo "Visão geral — {MES}/{ano}" também atualiza.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/tarefas/page.tsx
git commit -m "feat: pagina de tarefas usa o mes/ano selecionado globalmente"
```

---

### Task 6: Relatórios lê o mês/ano global (client component)

**Files:**
- Modify: `app/fiscal/relatorios/page.tsx`

- [ ] **Step 1: Importar os helpers de mês/ano**

Adicionar aos imports (`app/fiscal/relatorios/page.tsx:1-6`):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, Tarefa } from '@/lib/types'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { getMesAnoCliente } from '@/lib/mes-atual-cliente'
```

- [ ] **Step 2: Trocar a inicialização de `mes`/`ano` por estado sincronizado com o cookie**

Trocar (`app/fiscal/relatorios/page.tsx:23-26`):

```tsx
export default function RelatoriosPage() {
  const router = useRouter()
  const hoje = new Date()
  const [mes] = useState(hoje.getMonth() + 1)
  const [ano] = useState(hoje.getFullYear())
```

por:

```tsx
export default function RelatoriosPage() {
  const router = useRouter()
  const [mes, setMes] = useState<number>(() => getMesAnoRealAgora().mes)
  const [ano, setAno] = useState<number>(() => getMesAnoRealAgora().ano)

  useEffect(() => {
    const { mes: m, ano: a } = getMesAnoCliente()
    setMes(m)
    setAno(a)
  }, [])
```

O `useEffect` de fetch existente (`app/fiscal/relatorios/page.tsx:35-54`, `}, [mes, ano])`) não precisa mudar — já depende de `[mes, ano]`, então vai refazer o fetch automaticamente quando o `useEffect` do Step 2 atualizar o estado.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/relatorios/page.tsx`.

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/relatorios`, trocar o mês no Sidebar, voltar pra aba Relatórios (ou navegar até ela) e confirmar que a tabela recarrega com os dados do novo mês (o título de impressão também deve refletir `MESES_NOME[mes-1]` correto).

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/relatorios/page.tsx
git commit -m "feat: pagina de relatorios usa o mes/ano selecionado globalmente"
```

---

### Task 7: Histórico lê o ano (e destaque de mês) global

**Files:**
- Modify: `app/fiscal/historico/page.tsx`

- [ ] **Step 1: Importar os helpers e remover as constantes de módulo**

Remover (`app/fiscal/historico/page.tsx:10-11`):

```tsx
const ANO_ATUAL  = new Date().getFullYear()
const MES_ATUAL  = new Date().getMonth() + 1
```

Adicionar aos imports (`app/fiscal/historico/page.tsx:1-5`):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, Tarefa } from '@/lib/types'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { getMesAnoCliente } from '@/lib/mes-atual-cliente'
```

- [ ] **Step 2: Adicionar estado de `ano`/`mes` e sincronizar com o cookie no mount**

No início do componente (`app/fiscal/historico/page.tsx:18-23`), trocar:

```tsx
export default function HistoricoPage() {
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [selectedResp, setSelectedResp] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [isAdmin, setIsAdmin]       = useState(false)
```

por:

```tsx
export default function HistoricoPage() {
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [selectedResp, setSelectedResp] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [ano, setAno] = useState<number>(() => getMesAnoRealAgora().ano)
  const [mes, setMes] = useState<number>(() => getMesAnoRealAgora().mes)

  useEffect(() => {
    const { mes: m, ano: a } = getMesAnoCliente()
    setMes(m)
    setAno(a)
  }, [])
```

- [ ] **Step 3: Fazer o fetch de tarefas depender do `ano` selecionado**

Trocar o `useEffect` de fetch (`app/fiscal/historico/page.tsx:25-52`), de:

```tsx
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        setIsAdmin(admin)

        let clientesQ = sb.from('clientes').select('*').order('nome')
        if (!admin && p?.nome) clientesQ = (clientesQ as any).ilike('responsavel', p.nome)

        clientesQ.then(async ({ data: cs }) => {
          const ids = (cs ?? []).map((c: any) => c.id)
          let ts: any[] = []
          if (ids.length > 0) {
            const { data } = await sb
              .from('tarefas')
              .select('*')
              .eq('ano', ANO_ATUAL)
              .in('cliente_id', ids)
              .limit(10000)
            ts = data ?? []
          }
          setClientes((cs ?? []) as Cliente[])
          setTarefas(ts as Tarefa[])
          setLoading(false)
        })
      })
    })
  }, [])
```

para:

```tsx
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        setIsAdmin(admin)

        let clientesQ = sb.from('clientes').select('*').order('nome')
        if (!admin && p?.nome) clientesQ = (clientesQ as any).ilike('responsavel', p.nome)

        clientesQ.then(async ({ data: cs }) => {
          const ids = (cs ?? []).map((c: any) => c.id)
          let ts: any[] = []
          if (ids.length > 0) {
            const { data } = await sb
              .from('tarefas')
              .select('*')
              .eq('ano', ano)
              .in('cliente_id', ids)
              .limit(10000)
            ts = data ?? []
          }
          setClientes((cs ?? []) as Cliente[])
          setTarefas(ts as Tarefa[])
          setLoading(false)
        })
      })
    })
  }, [ano])
```

- [ ] **Step 4: Trocar as referências a `ANO_ATUAL` e `MES_ATUAL` no JSX**

Em `app/fiscal/historico/page.tsx:88-89` (título), trocar:

```tsx
        <h1 className="text-2xl font-bold text-white">Histórico Anual — {ANO_ATUAL}</h1>
```

por:

```tsx
        <h1 className="text-2xl font-bold text-white">Histórico Anual — {ano}</h1>
```

Nas 3 comparações de destaque (`app/fiscal/historico/page.tsx:96`, `152`, `177`, `213`), trocar cada `MES_ATUAL` por `mes`. Exemplo (linha 96):

```tsx
              const isCur = m === mes
```

(mesma troca `MES_ATUAL` → `mes` nas outras 3 ocorrências.)

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/historico/page.tsx` (nenhuma referência remanescente a `ANO_ATUAL`/`MES_ATUAL` — confirmar com busca de texto).

- [ ] **Step 6: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/historico`, trocar o ano no Sidebar (avançar 12 meses pra virar o ano), confirmar que o gráfico recarrega com dados do novo ano e que a coluna destacada como "atual" corresponde ao mês selecionado.

- [ ] **Step 7: Commit**

```bash
git add app/fiscal/historico/page.tsx
git commit -m "feat: pagina de historico usa o ano/mes selecionado globalmente"
```

---

### Task 8: Parcelamentos lê o ano global (cosmético)

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

- [ ] **Step 1: Importar os helpers e remover a constante de módulo**

Remover (`app/fiscal/parcelamentos/page.tsx:6`):

```tsx
const ANO = new Date().getFullYear()
```

Adicionar aos imports (`app/fiscal/parcelamentos/page.tsx:1-4`):

```tsx
'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { getMesAnoCliente } from '@/lib/mes-atual-cliente'
```

- [ ] **Step 2: Adicionar estado `ano` sincronizado com o cookie**

No início do componente (`app/fiscal/parcelamentos/page.tsx:63-76`), logo após `const [userNome, setUserNome] = useState<string | null>(null)`, adicionar:

```tsx
  const [ano, setAno] = useState<number>(() => getMesAnoRealAgora().ano)

  useEffect(() => {
    setAno(getMesAnoCliente().ano)
  }, [])
```

- [ ] **Step 3: Trocar todas as referências a `ANO` por `ano`**

Essa página não filtra a query por ano (`ANO` é só exibido no título e no relatório de impressão), então basta trocar o identificador nos usos existentes: `app/fiscal/parcelamentos/page.tsx:184` (`<title>Parcelamentos ${ANO} ...`), `:213` (`<h1>Relatório de Parcelamentos — ${ANO}</h1>`), `:223` (`Ano de referência</div><div class="value">${ANO}</div>`) e `:243` (`<h1 ...>Parcelamentos {ANO}</h1>`) — todos trocando `ANO` por `ano` (essas linhas já estão dentro do componente ou de `imprimir()`, uma função aninhada dentro do componente, então `ano` já está no escopo).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/fiscal/parcelamentos/page.tsx` (nenhuma referência remanescente a `ANO` maiúsculo — confirmar com busca de texto).

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`, abrir `/fiscal/parcelamentos`, trocar o ano no Sidebar, confirmar que o título "Parcelamentos {ano}" muda de acordo (a lista de parcelamentos em si não muda, já que não é filtrada por ano — comportamento esperado).

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: pagina de parcelamentos usa o ano selecionado globalmente (cosmetico)"
```

---

### Task 9: Verificação end-to-end e checagem de escopo excluído

**Files:** nenhum (apenas verificação manual)

- [ ] **Step 1: Rodar checagem completa de tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nenhum erro.

- [ ] **Step 2: Verificação manual completa**

Run: `npm run dev` e, logado, percorrer manualmente:
1. Trocar o mês/ano várias vezes no Sidebar (avançar e voltar, cruzar a virada de ano em ambas as direções: Dez→Jan e Jan→Dez).
2. Confirmar que Dashboard, Clientes, Tarefas, Relatórios, Histórico e Parcelamentos refletem o mês/ano selecionado (cada um do jeito descrito nas tasks 3–8).
3. Confirmar que **Calendário** (`/fiscal/calendario`) e **Agenda** (`/fiscal/agenda`) **não mudam** quando o seletor global do Sidebar é trocado — eles devem manter a navegação de mês própria e independente.
4. Fechar completamente o navegador (todas as janelas) e abrir de novo, logar e conferir que o seletor volta pro mês/ano real atual (cookie de sessão expirou).

- [ ] **Step 3: Atualizar o CHANGELOG.md**

Adicionar uma entrada no topo do `CHANGELOG.md` descrevendo a feature (versão e data a definir no momento do push, seguindo a skill `git-versioning`).

- [ ] **Step 4: Aguardar autorização do usuário para dar push**

Não commitar/push para o GitHub ainda — o usuário pediu explicitamente para só subir quando tudo estiver pronto e testado. Ao final desta task, avisar que a implementação está completa na branch local `v0.5.8` e perguntar se pode prosseguir com o fluxo de `git-versioning` (CHANGELOG + commit + push + PR).
