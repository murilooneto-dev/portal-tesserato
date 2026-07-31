# Links da Intranet editáveis, sem ícones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin cria, edita e exclui os cards de "Links Úteis" direto na página `/intranet`, sem sair dela. Os cards perdem o favicon e o ícone de seta — ficam só com título e domínio como texto.

**Architecture:** Três server actions novas (`app/(comum)/intranet/actions.ts`) fazem o CRUD em `links_rapidos`, gated por `role === 'admin'` (mesmo padrão de `criarUsuario`/`atualizarPerfil`). `components/fiscal/LinksRapidos.tsx` vira Client Component com um modo de edição opcional (só visível se `isAdmin`); `app/(comum)/intranet/page.tsx` passa a buscar `profile.role` do usuário logado e repassar como prop.

**Tech Stack:** Next.js 16 (App Router, Server Components/Functions), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Sem reordenar por arraste — link novo sempre entra com `ordem` = maior `ordem` atual + 1 (ou 0 se a tabela estiver vazia).
- Exclusão é definitiva (sem soft-delete via `ativo`) — mesmo padrão de "excluir" já usado no resto do app.
- `links_rapidos` continua global, sem coluna de setor — não introduzir nenhuma.
- `logo_url` (coluna existente, já sem uso antes desta mudança) não entra no formulário novo nem é exibida em lugar nenhum.
- Fora do modo de edição, os cards continuam clicáveis normalmente (abrem numa aba nova) pra qualquer usuário, admin ou não.

---

### Task 1: Server actions — `app/(comum)/intranet/actions.ts`

**Files:**
- Create: `app/(comum)/intranet/actions.ts`

**Interfaces:**
- Produces: `criarLink(titulo: string, url: string): Promise<{ error: string | null }>`, `atualizarLink(id: string, titulo: string, url: string): Promise<{ error: string | null }>`, `excluirLink(id: string): Promise<void>` — usadas pela Task 2.

- [ ] **Step 1: Criar o arquivo**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'

export async function criarLink(titulo: string, url: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { data: maiorOrdem } = await supabase
    .from('links_rapidos')
    .select('ordem')
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('links_rapidos').insert({
    titulo,
    url,
    ordem: (maiorOrdem?.ordem ?? -1) + 1,
  })

  if (error) return { error: error.message }
  revalidatePath('/intranet')
  return { error: null }
}

export async function atualizarLink(id: string, titulo: string, url: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase.from('links_rapidos').update({ titulo, url }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/intranet')
  return { error: null }
}

export async function excluirLink(id: string) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return

  await supabase.from('links_rapidos').delete().eq('id', id)
  revalidatePath('/intranet')
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `app/(comum)/intranet/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/(comum)/intranet/actions.ts"
git commit -m "feat: server actions de CRUD para links_rapidos"
```

---

### Task 2: `LinksRapidos.tsx` vira editável e sem ícones, `page.tsx` passa `isAdmin`

**Files:**
- Modify: `components/fiscal/LinksRapidos.tsx` (reescrita completa — o arquivo hoje é um Server Component sem interatividade; passa a ser Client Component com modo de edição)
- Modify: `app/(comum)/intranet/page.tsx`

**Interfaces:**
- Consumes: `criarLink`, `atualizarLink`, `excluirLink` (Task 1).
- Produces: `LinksRapidos({ links: LinkRapido[], isAdmin: boolean })` — novo shape de props, `isAdmin` é obrigatório (não tinha antes).

- [ ] **Step 1: Substituir `components/fiscal/LinksRapidos.tsx` inteiro**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LinkRapido } from '@/lib/types'
import { criarLink, atualizarLink, excluirLink } from '@/app/(comum)/intranet/actions'

interface Props {
  links: LinkRapido[]
  isAdmin: boolean
}

function getDomain(url: string) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname } catch { return '' }
}

const inputCls = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"

export default function LinksRapidos({ links, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [edits, setEdits] = useState<Record<string, { titulo: string; url: string }>>({})
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoUrl, setNovoUrl] = useState('')
  const [erro, setErro] = useState('')

  const ativos = links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)

  function campo(link: LinkRapido) {
    return edits[link.id] ?? { titulo: link.titulo, url: link.url }
  }

  function handleSalvar(link: LinkRapido) {
    const { titulo, url } = campo(link)
    setErro('')
    startTransition(async () => {
      const result = await atualizarLink(link.id, titulo.trim(), url.trim())
      if (result.error) { setErro(result.error); return }
      router.refresh()
    })
  }

  function handleExcluir(id: string) {
    if (!confirm('Excluir este link?')) return
    startTransition(async () => {
      await excluirLink(id)
      router.refresh()
    })
  }

  function handleAdicionar() {
    setErro('')
    startTransition(async () => {
      const result = await criarLink(novoTitulo.trim(), novoUrl.trim())
      if (result.error) { setErro(result.error); return }
      setNovoTitulo('')
      setNovoUrl('')
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">
          Links Úteis
        </h2>
        {isAdmin && (
          <button
            onClick={() => setEditando(v => !v)}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 px-2.5 py-1 rounded-lg transition-colors"
          >
            {editando ? 'Concluir edição' : 'Editar links'}
          </button>
        )}
      </div>

      {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ativos.map(link => {
          if (editando) {
            const { titulo, url } = campo(link)
            return (
              <div key={link.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--fg)]/4 border border-[var(--fg)]/8">
                <input
                  value={titulo}
                  onChange={e => setEdits(prev => ({ ...prev, [link.id]: { titulo: e.target.value, url: campo(link).url } }))}
                  placeholder="Título"
                  className={inputCls}
                />
                <input
                  value={url}
                  onChange={e => setEdits(prev => ({ ...prev, [link.id]: { titulo: campo(link).titulo, url: e.target.value } }))}
                  placeholder="URL"
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <button onClick={() => handleSalvar(link)} disabled={isPending || !titulo.trim() || !url.trim()}
                    className="flex-1 py-1 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40">
                    Salvar
                  </button>
                  <button onClick={() => handleExcluir(link.id)} disabled={isPending}
                    className="px-3 py-1 rounded-lg border border-[var(--fg)]/10 text-[var(--fg)]/40 hover:text-red-400 hover:border-red-400/30 text-xs transition-colors disabled:opacity-40">
                    Excluir
                  </button>
                </div>
              </div>
            )
          }

          const domain = getDomain(link.url)
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center p-4 rounded-xl bg-[var(--fg)]/4 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/7 hover:border-[var(--fg)]/15 transition-all group"
            >
              <p className="text-[var(--fg)] text-sm font-medium leading-tight truncate group-hover:text-[var(--accent)] transition-colors">
                {link.titulo}
              </p>
              <p className="text-[var(--fg)]/30 text-xs truncate mt-0.5">{domain}</p>
            </a>
          )
        })}

        {editando && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--fg)]/2 border border-dashed border-[var(--fg)]/15">
            <input
              value={novoTitulo}
              onChange={e => setNovoTitulo(e.target.value)}
              placeholder="Título"
              className={inputCls}
            />
            <input
              value={novoUrl}
              onChange={e => setNovoUrl(e.target.value)}
              placeholder="URL"
              className={inputCls}
            />
            <button onClick={handleAdicionar} disabled={isPending || !novoTitulo.trim() || !novoUrl.trim()}
              className="py-1 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40">
              + Adicionar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `app/(comum)/intranet/page.tsx` pra buscar `profile.role` e passar `isAdmin`**

Substituir o arquivo inteiro:

```tsx
import { createClient } from '@/lib/supabase/server'
import LinksRapidos from '@/components/fiscal/LinksRapidos'
import AgendaPessoal from '@/components/fiscal/AgendaPessoal'

export const metadata = { title: 'Intranet — Tesserato Fiscal' }

export default async function IntranetPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: links }, { data: settings }, { data: profile }] = await Promise.all([
    supabase.from('links_rapidos').select('*').order('ordem'),
    supabase.from('app_settings').select('dashboard_announcement').eq('id', 1).single(),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const comunicado = settings?.dashboard_announcement?.trim() ?? ''
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {comunicado && (
        <div className="mb-8 flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-amber-400 text-lg shrink-0">📢</span>
          <p className="text-amber-200/90 text-sm leading-relaxed whitespace-pre-wrap">{comunicado}</p>
        </div>
      )}
      <AgendaPessoal />
      <div className="mt-10 pt-8 border-t border-[var(--fg)]/8">
        <LinksRapidos links={links ?? []} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. Confirmar especificamente que o import `@/app/(comum)/intranet/actions` resolve sem erro (o alias `@/*` mapeia pra raiz do repo, `(comum)` é um nome de pasta normal — grupos de rota do Next não mudam o caminho de import).

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/LinksRapidos.tsx "app/(comum)/intranet/page.tsx"
git commit -m "feat: links da intranet editaveis por admin, sem icones"
```

---

### Task 3: Verificação final

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, todas as rotas existentes, nenhuma rota nova (server actions não criam rota própria).

- [ ] **Step 2: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Logar como admin, ir em `/intranet`. Confirmar que os cards não têm mais favicon nem ícone de seta — só título e domínio.
2. Clicar em "Editar links" — cada card vira um miniformulário com Título/URL/Salvar/Excluir, e aparece um card tracejado "+ Adicionar" no final.
3. Criar um link de teste (título + URL), confirmar que aparece na grade ao sair do modo de edição.
4. Editar o título desse link, salvar, confirmar que atualizou.
5. Excluir o link de teste, confirmar o `confirm()` e que ele some da lista.
6. Logar como um usuário não-admin, ir em `/intranet` — confirmar que o botão "Editar links" não aparece, e que os cards continuam clicáveis normalmente (abrem numa aba nova).

- [ ] **Step 3: Nota final**

Sem commit nesta task (só verificação). Se o Step 1 passar limpo, a feature está pronta pra revisão/teste manual do usuário, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge).
