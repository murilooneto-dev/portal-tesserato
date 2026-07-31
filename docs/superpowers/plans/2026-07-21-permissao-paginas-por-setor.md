# Permissão de acesso por página, por setor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a lista solta e nunca-aplicada de "Abas" (`profiles.abas_acesso`) por um controle de acesso por página **agrupado por setor** e **de verdade aplicado** — um usuário sem uma página marcada não consegue abrir aquela URL, exceto o Dashboard de cada setor (sempre implícito) e admins (sempre passam, como já é hoje pro setor).

**Architecture:** Uma nova coluna `profiles.paginas_acesso: text[]` guarda entradas `"<setor>:<slug>"`. Uma constante nova, `PAGINAS_POR_SETOR`, vira a fonte única da lista de páginas navegáveis por setor — hoje duplicada implicitamente entre `components/fiscal/Sidebar.tsx` (menu) e a tela de cadastro de usuário (que na real nunca teve essa lista corretamente estruturada). `proxy.ts` (o middleware deste projeto) ganha um segundo check, depois do check de setor já existente, que extrai a página da URL e confere contra `paginas_acesso`. A tela de usuário (`app/fiscal/parametros/ParametrosClient.tsx`) ganha, tanto na criação quanto na edição de usuário existente, um checklist agrupado por setor — só aparecem os grupos dos setores que o formulário tem marcado naquele momento.

**Tech Stack:** Next.js 16 (App Router, Server Components, Route Handlers/Middleware), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- `abas_acesso` fica no schema, sem uso — nunca dropar coluna (mesmo padrão adotado com as colunas do ENTRADA/SAIDAS).
- `Dashboard` de cada setor nunca é armazenado em `paginas_acesso` — é sempre implicitamente permitido pra quem tem aquele setor. Isso vale tanto no enforcement (`proxy.ts`) quanto na UI (a página "Dashboard" nunca aparece como checkbox).
- Societário e Financeiro ficam fora do escopo de permissão por página (`PAGINAS_POR_SETOR` tem array vazio pros dois) — continuam com a página única "Em construção" sem controle granular.
- `agenda`, `bots`, `tarefas` (Fiscal) não entram em `PAGINAS_POR_SETOR` — não fazem parte da navegação normal.
- `parametros`, `admin`, `vinculos` continuam exclusivos de admin pelo mecanismo já existente (`profile.role === 'admin'`) — não entram em `PAGINAS_POR_SETOR` nem no enforcement novo.
- Admin sempre passa em tudo — essa mudança não introduz nenhuma restrição nova pra quem é admin, em nenhum dos dois checks (setor e página).
- O checklist de páginas por setor aparece tanto na criação de usuário novo quanto na edição de um usuário já existente.
- `app/fiscal/parametros/ParametrosClient.tsx` tem divergência local pré-existente não sincronizada com `main` (arquivo já sinalizado em sessões anteriores) — mexer nele com cuidado extra, mudança cirúrgica, sem tocar em nada fora do escopo desta feature.

---

### Task 1: Migration — nova coluna `paginas_acesso`

**Files:**
- Create: `supabase/migrations/013_paginas_acesso.sql`

**Interfaces:**
- Produces: coluna `profiles.paginas_acesso text[] not null default '{}'` — consumida pelas Tasks 2-6.

- [ ] **Step 1: Criar o arquivo da migration**

```sql
-- supabase/migrations/013_paginas_acesso.sql

-- Substitui abas_acesso (nunca foi lida em nenhum lugar do código, só
-- salva) por um controle de acesso por página realmente aplicado no
-- proxy.ts, agora agrupado por setor. abas_acesso fica no schema, sem
-- uso — mesmo padrão adotado com as colunas do ENTRADA/SAIDAS (nunca
-- dropar coluna).
alter table profiles add column paginas_acesso text[] not null default '{}';
```

- [ ] **Step 2: Commit (sem aplicar ainda — a aplicação no dev é feita pelo controller na Task 7, não por este subagent, que não tem as credenciais do Supabase de dev)**

```bash
git add supabase/migrations/013_paginas_acesso.sql
git commit -m "feat: migration adiciona profiles.paginas_acesso"
```

---

### Task 2: `lib/paginas-setor.ts` + `Profile` ganha `paginas_acesso`

**Files:**
- Create: `lib/paginas-setor.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `PAGINAS_POR_SETOR: Record<UserSetor, { slug: string; label: string }[]>` (`lib/paginas-setor.ts`) — usada pelas Tasks 3, 4, 6. `Profile.paginas_acesso: string[]` (`lib/types.ts`) — usado pelas Tasks 4, 6.

- [ ] **Step 1: Criar `lib/paginas-setor.ts`**

```ts
// lib/paginas-setor.ts
import type { UserSetor } from './types'

export interface PaginaSetor {
  slug: string
  label: string
}

// Fonte única da lista de páginas navegáveis por setor — usada tanto
// pelo menu (components/fiscal/Sidebar.tsx) quanto pelo controle de
// acesso por página (proxy.ts, app/fiscal/parametros). Páginas fora da
// navegação normal (agenda, bots, tarefas) e exclusivas de admin
// (parametros, admin, vinculos) não entram aqui.
export const PAGINAS_POR_SETOR: Record<UserSetor, PaginaSetor[]> = {
  fiscal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'historico', label: 'Histórico' },
    { slug: 'parcelamentos', label: 'Parcelamentos' },
    { slug: 'conferencia', label: 'Conferência' },
  ],
  contabil: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'historico', label: 'Histórico' },
    { slug: 'calendario', label: 'Calendário' },
  ],
  pessoal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'historico', label: 'Histórico' },
    { slug: 'calendario', label: 'Calendário' },
  ],
  societario: [],
  financeiro: [],
}
```

- [ ] **Step 2: Adicionar `paginas_acesso` na interface `Profile`**

Em `lib/types.ts`, substituir (linhas 24-31):

```ts
export interface Profile {
  id: string
  nome: string
  role: UserRole
  setores: UserSetor[]
  cor: string
  created_at: string
}
```

por:

```ts
export interface Profile {
  id: string
  nome: string
  role: UserRole
  setores: UserSetor[]
  cor: string
  created_at: string
  paginas_acesso: string[]
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros relacionados a `lib/paginas-setor.ts`/`lib/types.ts` (podem aparecer erros em outros arquivos que ainda não sabem sobre `paginas_acesso` — normal, resolvidos nas próximas tasks; anote quais arquivos ainda faltam se aparecerem).

- [ ] **Step 4: Commit**

```bash
git add lib/paginas-setor.ts lib/types.ts
git commit -m "feat: PAGINAS_POR_SETOR e Profile.paginas_acesso"
```

---

### Task 3: `components/fiscal/Sidebar.tsx` usa `PAGINAS_POR_SETOR`

**Files:**
- Modify: `components/fiscal/Sidebar.tsx`

**Interfaces:**
- Consumes: `PAGINAS_POR_SETOR` (Task 2).
- Produces: nenhuma interface nova — o componente continua exportando o mesmo `Sidebar` com as mesmas props, só a fonte interna dos itens de menu muda.

- [ ] **Step 1: Adicionar o import**

Adicionar, junto aos outros imports (depois da linha 8, `import { useTheme } from '@/lib/theme'`):

```tsx
import { PAGINAS_POR_SETOR } from '@/lib/paginas-setor'
```

- [ ] **Step 2: Trocar `ITENS_POR_SETOR` por uma versão derivada de `PAGINAS_POR_SETOR`**

Substituir (linhas 24-50):

```tsx
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
  contabil: [
    { href: '/contabil/dashboard', label: 'Dashboard',     icon: LayoutGrid },
    { href: '/contabil/clientes',  label: 'Clientes',      icon: Users    },
    { href: '/contabil/relatorios',label: 'Relatórios',    icon: FileText },
    { href: '/contabil/historico', label: 'Histórico',     icon: TrendingUp },
    { href: '/contabil/calendario',label: 'Calendário',    icon: Calendar },
  ],
  pessoal: [
    { href: '/pessoal/dashboard',  label: 'Dashboard',  icon: LayoutGrid },
    { href: '/pessoal/clientes',   label: 'Clientes',   icon: Users    },
    { href: '/pessoal/relatorios', label: 'Relatórios', icon: FileText },
    { href: '/pessoal/historico',  label: 'Histórico',  icon: TrendingUp },
    { href: '/pessoal/calendario', label: 'Calendário', icon: Calendar },
  ],
  societario: [{ href: '/societario', label: 'Em construção', icon: Wrench }],
  financeiro: [{ href: '/financeiro', label: 'Em construção', icon: Wrench }],
}
```

por:

```tsx
const ICONES_PAGINA: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  clientes: Users,
  calendario: Calendar,
  relatorios: FileText,
  historico: TrendingUp,
  parcelamentos: CreditCard,
  conferencia: ClipboardCheck,
}

function itensDoSetor(setor: UserSetor): NavItem[] {
  const paginas = PAGINAS_POR_SETOR[setor]
  if (paginas.length === 0) {
    return [{ href: `/${setor}`, label: 'Em construção', icon: Wrench }]
  }
  return paginas.map(p => ({
    href: `/${setor}/${p.slug}`,
    label: p.label,
    icon: ICONES_PAGINA[p.slug] ?? Wrench,
  }))
}

const ITENS_POR_SETOR: Record<UserSetor, NavItem[]> = {
  fiscal: itensDoSetor('fiscal'),
  contabil: itensDoSetor('contabil'),
  pessoal: itensDoSetor('pessoal'),
  societario: itensDoSetor('societario'),
  financeiro: itensDoSetor('financeiro'),
}
```

(O resultado final de `ITENS_POR_SETOR` deve ficar idêntico ao de antes — mesmo `href`, `label` e `icon` pra cada item, em cada setor. Isso é uma refatoração de fonte, não uma mudança de comportamento visual.)

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros relacionados a `components/fiscal/Sidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/Sidebar.tsx
git commit -m "refactor: Sidebar usa PAGINAS_POR_SETOR como fonte unica do menu"
```

---

### Task 4: `proxy.ts` aplica o controle por página

**Files:**
- Modify: `proxy.ts`

**Interfaces:**
- Consumes: `Profile.paginas_acesso` (Task 2, via query direta ao Supabase — este arquivo não importa `lib/types.ts` além do que já importa).

- [ ] **Step 1: Substituir o bloco de checagem de setor**

Substituir (o bloco `if (setorDaRota) { ... }` inteiro):

```ts
  const setorDaRota = PREFIXOS_SETOR.find(s => pathname.startsWith(`/${s}`))
  if (setorDaRota) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setores, role')
      .eq('id', user.id)
      .single()

    const podeAcessar = profile?.role === 'admin' || (profile?.setores ?? []).includes(setorDaRota)

    if (!podeAcessar) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      const destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }
```

por:

```ts
  const setorDaRota = PREFIXOS_SETOR.find(s => pathname.startsWith(`/${s}`))
  if (setorDaRota) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setores, role, paginas_acesso')
      .eq('id', user.id)
      .single()

    const podeAcessarSetor = profile?.role === 'admin' || (profile?.setores ?? []).includes(setorDaRota)

    const resto = pathname.slice(`/${setorDaRota}`.length).replace(/^\//, '')
    const pagina = resto.split('/')[0] || 'dashboard'
    const podeAcessarPagina =
      profile?.role === 'admin' ||
      pagina === 'dashboard' ||
      (profile?.paginas_acesso ?? []).includes(`${setorDaRota}:${pagina}`)

    if (!podeAcessarSetor || !podeAcessarPagina) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      const destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros relacionados a `proxy.ts`.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: proxy aplica controle de acesso por pagina, alem do setor"
```

---

### Task 5: `app/fiscal/parametros/actions.ts` — `criarUsuario`/`atualizarPerfil` gravam `paginas_acesso`

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`

**Interfaces:**
- Produces: `criarUsuario(payload: { ..., paginasAcesso: string[], setores: string[] })` (renomeia o campo `abas` → `paginasAcesso`), `atualizarPerfil` passa a ler `formData.getAll('paginas_acesso')` — ambos consumidos pela Task 6.

- [ ] **Step 1: Atualizar `atualizarPerfil`**

Substituir:

```ts
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

por:

```ts
export async function atualizarPerfil(id: string, formData: FormData) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) throw new Error('Não autorizado.')
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') throw new Error('Acesso negado.')

  const setores = formData.getAll('setores') as string[]
  const paginasAcesso = formData.getAll('paginas_acesso') as string[]

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: formData.get('nome') as string,
      role: formData.get('role') as string,
      cor:  formData.get('cor')  as string,
      setores: setores.length > 0 ? setores : ['fiscal'],
      paginas_acesso: paginasAcesso,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/parametros')
}
```

- [ ] **Step 2: Atualizar `criarUsuario` — assinatura**

Substituir:

```ts
export async function criarUsuario(payload: {
  nome: string
  login: string
  senha: string
  role: string
  cor: string
  abas: string[]
  setores: string[]
}): Promise<{ error?: string }> {
```

por:

```ts
export async function criarUsuario(payload: {
  nome: string
  login: string
  senha: string
  role: string
  cor: string
  paginasAcesso: string[]
  setores: string[]
}): Promise<{ error?: string }> {
```

- [ ] **Step 3: Atualizar `criarUsuario` — gravação no `profiles.update`**

Substituir:

```ts
  const { error: profErr } = await admin.from('profiles').update({
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setores: payload.setores.length > 0 ? payload.setores : ['fiscal'],
    abas_acesso: payload.abas,
  }).eq('id', userId)
```

por:

```ts
  const { error: profErr } = await admin.from('profiles').update({
    nome: payload.nome,
    role: payload.role,
    cor: payload.cor,
    setores: payload.setores.length > 0 ? payload.setores : ['fiscal'],
    paginas_acesso: payload.paginasAcesso,
  }).eq('id', userId)
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: erros esperados em `app/fiscal/parametros/ParametrosClient.tsx` (ainda chama `criarUsuario` com o campo antigo `abas` — resolvido na Task 6). Nenhum erro deve aparecer dentro de `app/fiscal/parametros/actions.ts` em si.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/parametros/actions.ts
git commit -m "feat: criarUsuario e atualizarPerfil gravam paginas_acesso"
```

---

### Task 6: `app/fiscal/parametros/ParametrosClient.tsx` — checklist agrupado por setor

**Files:**
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`

**Interfaces:**
- Consumes: `PAGINAS_POR_SETOR` (Task 2), `Profile.paginas_acesso` (Task 2), `criarUsuario`/`atualizarPerfil` com a nova assinatura (Task 5).

Este arquivo é grande (1500+ linhas) e tem divergência local pré-existente não sincronizada com `main` — mudança cirúrgica, só nos pontos listados abaixo. Nada relacionado a templates, duplicatas de tarefa, parcelamentos, ou qualquer outra seção da tela deve mudar.

- [ ] **Step 1: Imports**

Substituir (linha 6):

```tsx
import { SETORES, SETOR_LABEL } from '@/lib/types'
```

por:

```tsx
import { SETORES, SETOR_LABEL, type UserSetor } from '@/lib/types'
import { PAGINAS_POR_SETOR } from '@/lib/paginas-setor'
```

- [ ] **Step 2: Remover a constante `ABAS`**

Remover (linhas 49-52):

```tsx
const ABAS = [
  'Intranet', 'Dashboard', 'Clientes', 'Calendários',
  'Conferência', 'Relatórios', 'Histórico', 'Empresas', 'Parcelamentos',
]
```

- [ ] **Step 3: Trocar o estado `novoAbas` por `novoPaginas`**

Substituir (linhas 113-114):

```tsx
  const [novoAbas, setNovoAbas] = useState<string[]>([...ABAS])
  const [novoSetores, setNovoSetores] = useState<string[]>(['fiscal'])
```

por:

```tsx
  const [novoPaginas, setNovoPaginas] = useState<string[]>(
    PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`)
  )
  const [novoSetores, setNovoSetores] = useState<string[]>(['fiscal'])
```

- [ ] **Step 4: `handleCriarUsuario` — usar `paginasAcesso`, resetar `novoPaginas`**

Substituir:

```ts
    const result = await criarUsuario({
      nome: novoNome.trim(),
      login: novoLogin.trim(),
      senha: novoSenha,
      role: novoPerfil,
      cor: novoCor,
      abas: novoAbas,
      setores: novoSetores,
    })
    setCriandoUser(false)
    if (result.error) {
      setNovoUserErr(result.error)
    } else {
      setNovoUserOk(true)
      setNovoNome('')
      setNovoLogin('')
      setNovoSenha('')
      setNovoPerfil('operador')
      setNovoCor('#6366f1')
      setNovoAbas([...ABAS])
      setNovoSetores(['fiscal'])
      router.refresh()
      setTimeout(() => setNovoUserOk(false), 3000)
    }
```

por:

```ts
    const result = await criarUsuario({
      nome: novoNome.trim(),
      login: novoLogin.trim(),
      senha: novoSenha,
      role: novoPerfil,
      cor: novoCor,
      paginasAcesso: novoPaginas,
      setores: novoSetores,
    })
    setCriandoUser(false)
    if (result.error) {
      setNovoUserErr(result.error)
    } else {
      setNovoUserOk(true)
      setNovoNome('')
      setNovoLogin('')
      setNovoSenha('')
      setNovoPerfil('operador')
      setNovoCor('#6366f1')
      setNovoPaginas(PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`))
      setNovoSetores(['fiscal'])
      router.refresh()
      setTimeout(() => setNovoUserOk(false), 3000)
    }
```

- [ ] **Step 5: `toggleAba` → `togglePagina`, `toggleSetor` limpa páginas do setor removido**

Substituir:

```ts
  function toggleAba(aba: string) {
    setNovoAbas(prev => prev.includes(aba) ? prev.filter(a => a !== aba) : [...prev, aba])
  }

  function toggleSetor(setor: string) {
    setNovoSetores(prev => prev.includes(setor) ? prev.filter(s => s !== setor) : [...prev, setor])
  }
```

por:

```ts
  function togglePagina(chave: string) {
    setNovoPaginas(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])
  }

  function toggleSetor(setor: string) {
    setNovoSetores(prev => {
      const removendo = prev.includes(setor)
      if (removendo) {
        setNovoPaginas(p => p.filter(chave => !chave.startsWith(`${setor}:`)))
      }
      return removendo ? prev.filter(s => s !== setor) : [...prev, setor]
    })
  }
```

- [ ] **Step 6: Render do formulário "Novo Usuário" — trocar o bloco "Acesso às Abas" pelo checklist agrupado**

Substituir:

```tsx
              <div>
                <label className={labelCls}>Acesso às Abas</label>
                <div className="grid grid-cols-3 gap-2">
                  {ABAS.map(aba => (
                    <label key={aba} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={novoAbas.includes(aba)} onChange={() => toggleAba(aba)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/60 text-xs">{aba}</span>
                    </label>
                  ))}
                </div>
              </div>

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

por:

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

              {novoSetores.filter(s => PAGINAS_POR_SETOR[s as UserSetor].length > 0).map(setor => (
                <div key={setor}>
                  <label className={labelCls}>Páginas — {SETOR_LABEL[setor as UserSetor]}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAGINAS_POR_SETOR[setor as UserSetor].filter(p => p.slug !== 'dashboard').map(p => {
                      const chave = `${setor}:${p.slug}`
                      return (
                        <label key={chave} className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={novoPaginas.includes(chave)} onChange={() => togglePagina(chave)}
                            className="w-3.5 h-3.5 accent-[var(--accent)]" />
                          <span className="text-[var(--fg)]/60 text-xs">{p.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
```

- [ ] **Step 7: `handleSaveProfile` — enviar `paginas_acesso` no FormData**

Substituir:

```ts
  async function handleSaveProfile(id: string) {
    const edits = profileEdits[id]
    if (!edits) return
    const profile = profiles.find(p => p.id === id)!
    setSavingProfile(id)
    const fd = new FormData()
    fd.set('nome', edits.nome ?? profile.nome)
    fd.set('role', edits.role ?? profile.role)
    fd.set('cor',  edits.cor  ?? profile.cor)
    const setores = edits.setores ?? profile.setores
    for (const s of setores) fd.append('setores', s)
    await atualizarPerfil(id, fd)
    setSavingProfile(null)
    setEditingProfile(null)
    router.refresh()
  }
```

por:

```ts
  async function handleSaveProfile(id: string) {
    const edits = profileEdits[id]
    if (!edits) return
    const profile = profiles.find(p => p.id === id)!
    setSavingProfile(id)
    const fd = new FormData()
    fd.set('nome', edits.nome ?? profile.nome)
    fd.set('role', edits.role ?? profile.role)
    fd.set('cor',  edits.cor  ?? profile.cor)
    const setores = edits.setores ?? profile.setores
    for (const s of setores) fd.append('setores', s)
    const paginasAcesso = edits.paginas_acesso ?? profile.paginas_acesso ?? []
    for (const c of paginasAcesso) fd.append('paginas_acesso', c)
    await atualizarPerfil(id, fd)
    setSavingProfile(null)
    setEditingProfile(null)
    router.refresh()
  }
```

- [ ] **Step 8: Render do formulário de edição de usuário existente — checkbox de setor limpa páginas, e adicionar o checklist agrupado**

Substituir o `onChange` do checkbox de setor:

```tsx
                                onChange={() => {
                                  const atual = edits.setores ?? p.setores
                                  const novo = atual.includes(setor) ? atual.filter(s => s !== setor) : [...atual, setor]
                                  setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], setores: novo } }))
                                }}
```

por:

```tsx
                                onChange={() => {
                                  const atual = edits.setores ?? p.setores
                                  const removendo = atual.includes(setor)
                                  const novo = removendo ? atual.filter(s => s !== setor) : [...atual, setor]
                                  const paginasAtual = edits.paginas_acesso ?? p.paginas_acesso ?? []
                                  const paginasNovo = removendo
                                    ? paginasAtual.filter(c => !c.startsWith(`${setor}:`))
                                    : paginasAtual
                                  setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], setores: novo, paginas_acesso: paginasNovo } }))
                                }}
```

Logo depois do `</div>` que fecha o grid de checkboxes de Setores (o `<div className="grid grid-cols-2 gap-2">{SETORES.map(...)}</div>` do formulário de edição — não o de "Novo Usuário", já tratado no Step 6), e antes do `<div className="flex gap-2">` que tem os botões Salvar/Cancelar, inserir:

```tsx
                        {(edits.setores ?? p.setores).filter(s => PAGINAS_POR_SETOR[s].length > 0).map(setor => (
                          <div key={setor}>
                            <p className="text-[var(--fg)]/40 text-[10px] uppercase tracking-widest mb-1">Páginas — {SETOR_LABEL[setor]}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {PAGINAS_POR_SETOR[setor].filter(pg => pg.slug !== 'dashboard').map(pg => {
                                const chave = `${setor}:${pg.slug}`
                                const atual = edits.paginas_acesso ?? p.paginas_acesso ?? []
                                return (
                                  <label key={chave} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={atual.includes(chave)}
                                      onChange={() => {
                                        const novo = atual.includes(chave) ? atual.filter(c => c !== chave) : [...atual, chave]
                                        setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], paginas_acesso: novo } }))
                                      }}
                                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                                    />
                                    <span className="text-[var(--fg)]/60 text-xs">{pg.label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
```

- [ ] **Step 9: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. Confirmar especificamente que não sobrou nenhuma referência a `ABAS`, `novoAbas`, `setNovoAbas`, ou `toggleAba` no arquivo.

- [ ] **Step 10: Commit**

```bash
git add app/fiscal/parametros/ParametrosClient.tsx
git commit -m "feat: tela de usuario ganha checklist de paginas agrupado por setor"
```

---

### Task 7: Aplicar no dev e verificação final

**Files:** nenhum novo — aplicação de migration + verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, todas as rotas existentes, nenhuma rota nova.

- [ ] **Step 2: Aplicar a migration no Supabase de dev (controller — pergunte ao usuário como aplicar nesse momento, já que é uma alteração de schema (ALTER TABLE) e não dá pra fazer via REST insert como nas migrations anteriores desta sessão que eram só INSERT)**

Opções pra apresentar ao usuário quando chegar aqui: rodar manualmente no SQL Editor do Supabase de dev (mais simples, sem precisar de credenciais novas), ou pedir token de acesso + senha do banco pra rodar `supabase db push` (mesmo caveat de dessincronia do histórico de migrations do CLI já registrado em memória de sessões anteriores).

Depois de aplicada, verificar:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'profiles' and column_name = 'paginas_acesso';
```

Expected: 1 linha, `data_type = 'ARRAY'`, `column_default` contendo `'{}'`.

- [ ] **Step 3: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Na tela `/fiscal/parametros`, aba de usuários: criar um usuário de teste marcando Fiscal e Contábil em Setores. Confirmar que aparecem dois blocos de páginas (um "Páginas — Fiscal", outro "Páginas — Contábil"), cada um com as páginas certas daquele setor, sem Dashboard na lista.
2. Desmarcar algumas páginas de cada setor (ex: deixar só Clientes e Relatórios liberados no Fiscal, só Dashboard implícito no Contábil). Criar o usuário.
3. Desmarcar o setor Contábil no formulário — confirmar que o bloco "Páginas — Contábil" some.
4. Logar como o usuário de teste (ou usar uma sessão de teste). Confirmar: `/fiscal/dashboard` abre (implícito); `/fiscal/clientes` e `/fiscal/relatorios` abrem (marcados); `/fiscal/historico` redireciona pro dashboard (não marcado); `/contabil/dashboard` abre (implícito, já que o setor Contábil não foi desmarcado neste teste) ou redireciona (se foi desmarcado no passo 3 e o setor em si já bloquearia antes de chegar no check de página).
5. Editar esse mesmo usuário já criado, marcar mais uma página do Fiscal, salvar, confirmar que a nova página abre sem precisar recriar o usuário.
6. Confirmar que um usuário com `role='admin'` continua acessando tudo, mesmo sem nada marcado em `paginas_acesso`.

- [ ] **Step 4: Nota final**

Sem commit nesta task (só aplicação de migration + verificação). Se os Steps 1 e 2 passarem limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores. Essa mudança só existe no banco de dev — produção não tem `paginas_acesso` (nem o resto do schema desta expansão) ainda.
