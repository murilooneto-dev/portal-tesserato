# Criar tipo de tarefa (Data/Texto/Opções) direto no cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o usuário digita, no campo Tarefas de qualquer um dos três setores (Contábil, Pessoal, Fiscal), um nome que ainda não existe no catálogo `tarefa_tipos` daquele setor, abrir um miniformulário para escolher o formato — Data / Texto+anexo / Opções (etapas nomeadas) — e criar o tipo no catálogo antes de adicioná-lo ao cliente. Nomes que já existem no catálogo continuam sendo adicionados direto, como hoje.

**Architecture:** Um componente novo e compartilhado, `components/geral/NovoTipoTarefaModal.tsx`, entra como overlay sobre qualquer um dos 4 modais de cliente que hoje têm o campo Tarefas (`EmpresaContabilModal.tsx`, `EmpresaPessoalModal.tsx`, `EmpresaModal.tsx` do Fiscal, e a seção Fiscal de `ClienteGeralModal.tsx`). A função `addTarefa()` de cada um passa a checar (case-insensitive, trim) se o nome digitado já existe no catálogo daquele setor: se sim, comportamento inalterado; se não, abre o miniformulário em vez de adicionar direto. Um novo server action, `criarTipoTarefa`, insere a linha em `tarefa_tipos` — ele mora em `lib/tarefa-tipos.ts` (mesmo arquivo das funções puras já existentes) usando a diretiva `'use server'` **por função** (não no topo do arquivo), porque um arquivo `'use server'` só pode exportar funções assíncronas, e `tarefaVisivelNoMes`/`filtrarTarefasVisiveis` são síncronas. `ENTRADA`/`SAIDAS` (Fiscal) ficam bloqueados como nomes reservados dentro desse action — nenhum outro código existente é tocado.

**Tech Stack:** Next.js 16 (App Router, Server Components/Functions), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Só cria tipos novos no catálogo — nenhum tipo existente é editado ou tem seu formato alterado.
- `ENTRADA` e `SAIDAS` (nomes exatos, case-sensitive — é assim que `components/fiscal/TarefaChecklist.tsx` os reconhece) não podem virar tipos de catálogo no Fiscal.
- Nenhuma migration de banco — `tarefa_tipos` já tem todas as colunas necessárias (`tipo_resposta`, `etapas`, `meses_visiveis` nullable).
- Tipos criados por este fluxo nascem sempre com `meses_visiveis = null` (sempre visíveis, mesmo default de todo o catálogo hoje) — não expor essa opção no miniformulário.
- `criarTipoTarefa` usa `getAuthenticatedAdmin()` (service role), mesmo padrão de toda outra server action do projeto — necessário porque a policy RLS de `tarefa_tipos` restringe insert a `is_admin()`, e qualquer usuário autenticado que pode criar/editar cliente deve poder criar um tipo novo.
- Corrida de criação (dois usuários criando o mesmo nome novo ao mesmo tempo): a constraint `unique(setor, nome)` do banco protege; tratar a violação (código Postgres `23505`) como sucesso silencioso, não como erro.

---

### Task 1: `lib/tarefa-tipos.ts` — helper de comparação e server action `criarTipoTarefa`

**Files:**
- Modify: `lib/tarefa-tipos.ts`

**Interfaces:**
- Produces: `tarefaExisteNoCatalogo(catalogo: string[], nome: string): boolean`, `criarTipoTarefa(setor: UserSetor, nome: string, tipoResposta: TipoResposta, etapas: string[] | null): Promise<{ error: string | null }>` — usadas pelas Tasks 2–5.

- [ ] **Step 1: Adicionar os imports no topo do arquivo**

Arquivo atual começa com `// lib/tarefa-tipos.ts` na linha 1, seguido de linha em branco. Inserir os imports logo depois dessa primeira linha:

```ts
// lib/tarefa-tipos.ts

import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor, TipoResposta } from './types'
```

- [ ] **Step 2: Adicionar `tarefaExisteNoCatalogo` e `criarTipoTarefa` no final do arquivo**

```ts

// Compara ignorando maiúsculas/minúsculas e espaços nas pontas, pra "NFSe"
// e " nfse " não virarem dois tipos diferentes no catálogo.
export function tarefaExisteNoCatalogo(catalogo: string[], nome: string): boolean {
  const alvo = nome.trim().toLowerCase()
  return catalogo.some(c => c.trim().toLowerCase() === alvo)
}

// ENTRADA/SAIDAS são reconhecidas por nome literal (case-sensitive) em
// components/fiscal/TarefaChecklist.tsx, antes de qualquer lookup no
// catálogo — um tipo de catálogo com esse nome exato nunca seria alcançado
// e só geraria confusão. Bloqueado aqui, na origem.
const NOMES_RESERVADOS_FISCAL = ['ENTRADA', 'SAIDAS']

export async function criarTipoTarefa(
  setor: UserSetor,
  nome: string,
  tipoResposta: TipoResposta,
  etapas: string[] | null,
): Promise<{ error: string | null }> {
  'use server'

  const nomeTrim = nome.trim()
  if (setor === 'fiscal' && NOMES_RESERVADOS_FISCAL.includes(nomeTrim)) {
    return { error: 'Esse nome é reservado pelo sistema (usado pelas etapas fixas de Entrada/Saídas) e não pode virar um tipo de tarefa.' }
  }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase.from('tarefa_tipos').insert({
    setor,
    nome: nomeTrim,
    tipo_resposta: tipoResposta,
    etapas,
  })

  if (error) {
    // unique(setor, nome): outra pessoa criou esse tipo nesse meio tempo —
    // tratado como sucesso, é exatamente o resultado que queríamos.
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `lib/tarefa-tipos.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/tarefa-tipos.ts
git commit -m "feat: helper de comparacao e server action criarTipoTarefa no catalogo"
```

---

### Task 2: `components/geral/NovoTipoTarefaModal.tsx` — miniformulário compartilhado

**Files:**
- Create: `components/geral/NovoTipoTarefaModal.tsx`

**Interfaces:**
- Consumes: `criarTipoTarefa` (`lib/tarefa-tipos.ts`, Task 1), `UserSetor`/`TipoResposta` (`lib/types.ts`).
- Produces: componente `NovoTipoTarefaModal({ nome: string, setor: UserSetor, onCancel: () => void, onCriado: (nome: string) => void })` — usado pelas Tasks 3–6.

- [ ] **Step 1: Criar o arquivo**

```tsx
'use client'

import { useState } from 'react'
import { criarTipoTarefa } from '@/lib/tarefa-tipos'
import type { UserSetor, TipoResposta } from '@/lib/types'

type Formato = 'data' | 'texto' | 'opcoes'

interface Props {
  nome: string
  setor: UserSetor
  onCancel: () => void
  onCriado: (nome: string) => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

const FORMATOS: { value: Formato; label: string; desc: string }[] = [
  { value: 'data', label: 'Data', desc: 'Checkbox simples com data de conclusão' },
  { value: 'texto', label: 'Texto + anexo', desc: 'Campo de texto livre e/ou upload de arquivos' },
  { value: 'opcoes', label: 'Opções', desc: 'Lista de etapas nomeadas, cada uma com seu checkbox' },
]

export default function NovoTipoTarefaModal({ nome, setor, onCancel, onCriado }: Props) {
  const [formato, setFormato] = useState<Formato>('data')
  const [etapas, setEtapas] = useState<string[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function addEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    setEtapas(prev => [...prev, e])
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (formato === 'opcoes' && etapas.length === 0) return
    setSalvando(true)
    setErro(null)
    const tipoResposta: TipoResposta = formato === 'texto' ? 'texto' : 'data'
    const etapasFinal = formato === 'opcoes' ? etapas : null
    const { error } = await criarTipoTarefa(setor, nome, tipoResposta, etapasFinal)
    setSalvando(false)
    if (error) { setErro(error); return }
    onCriado(nome)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Novo tipo de tarefa</h2>
          <button onClick={onCancel} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <p className="text-[var(--fg)]/60 text-sm">
            &quot;<span className="font-semibold text-[var(--fg)]">{nome}</span>&quot; ainda não existe no catálogo. Escolha o formato de resposta:
          </p>

          <div className="space-y-2">
            {FORMATOS.map(f => (
              <label key={f.value}
                className={`flex items-start gap-3 cursor-pointer px-4 py-3 rounded-xl border transition-all ${
                  formato === f.value ? 'border-[var(--accent)]/50 bg-[var(--accent)]/8' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'
                }`}>
                <input type="radio" name="formato" checked={formato === f.value}
                  onChange={() => setFormato(f.value)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--fg)]">{f.label}</span>
                  <span className="block text-xs text-[var(--fg)]/40">{f.desc}</span>
                </span>
              </label>
            ))}
          </div>

          {formato === 'opcoes' && (
            <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
              <label className={labelCls}>Etapas ({etapas.length})</label>
              <div className="flex flex-wrap gap-1.5 mb-3 mt-2 min-h-[32px]">
                {etapas.map((e, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
                    {e}
                    <button type="button" onClick={() => setEtapas(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEtapa())}
                  placeholder="Digitar nome da etapa e pressionar Enter..."
                  className={inputCls + ' flex-1 text-xs'} />
                <button type="button" onClick={addEtapa}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
                  + Adicionar
                </button>
              </div>
            </div>
          )}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleCriar} disabled={salvando || (formato === 'opcoes' && etapas.length === 0)}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {salvando ? 'Criando...' : 'Criar tipo'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/geral/NovoTipoTarefaModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/geral/NovoTipoTarefaModal.tsx
git commit -m "feat: miniformulario NovoTipoTarefaModal para criar tipo de tarefa no catalogo"
```

---

### Task 3: Ligar em `EmpresaContabilModal.tsx`

**Files:**
- Modify: `components/contabil/EmpresaContabilModal.tsx`

**Interfaces:**
- Consumes: `tarefaExisteNoCatalogo` (Task 1), `NovoTipoTarefaModal` (Task 2). Já recebe `tarefasPadrao: string[]` como prop (nomes do catálogo Contábil, vindo de `app/contabil/clientes/page.tsx` e `app/contabil/clientes/[id]/page.tsx`) — nenhuma mudança de prop necessária.

- [ ] **Step 1: Adicionar os imports**

Modificar o topo do arquivo (linhas 1–7):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
```

- [ ] **Step 2: Adicionar estado novo**

Modificar (linhas 44–45, dentro do componente):

```tsx
  const [form, setForm] = useState<FormData>(emptyForm(tarefasPadrao))
  const [novaTarefa, setNovaTarefa] = useState('')
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>(tarefasPadrao)
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)
```

- [ ] **Step 3: Trocar `addTarefa` e adicionar `handleTipoCriado`**

Substituir (linhas 90–95):

```tsx
  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }
```

- [ ] **Step 4: Envolver o `return` num Fragment e renderizar o miniformulário**

O `return` do componente hoje começa em (linha 138):

```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
```

Trocar para:

```tsx
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
```

E o fechamento do componente hoje é (linhas 260–264):

```tsx
        </div>
      </div>
    </div>
  )
}
```

Trocar para:

```tsx
        </div>
      </div>
    </div>
    {nomeParaCriar && (
      <NovoTipoTarefaModal
        nome={nomeParaCriar}
        setor="contabil"
        onCancel={() => setNomeParaCriar(null)}
        onCriado={handleTipoCriado}
      />
    )}
    </>
  )
}
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/contabil/EmpresaContabilModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/contabil/EmpresaContabilModal.tsx
git commit -m "feat: campo Tarefas do Contabil abre miniformulario para nomes novos"
```

---

### Task 4: Ligar em `EmpresaPessoalModal.tsx`

**Files:**
- Modify: `components/pessoal/EmpresaPessoalModal.tsx`

**Interfaces:**
- Consumes: mesmas de Task 3. Já recebe `tarefasPadrao: string[]` (catálogo Pessoal, vindo de `app/pessoal/clientes/page.tsx` e `app/pessoal/clientes/[id]/page.tsx`).

Este arquivo é estruturalmente idêntico a `EmpresaContabilModal.tsx` (mesmo layout, mesmas linhas). Repetir os mesmos 4 passos da Task 3 neste arquivo, com uma única diferença: `setor="pessoal"` no `NovoTipoTarefaModal`.

- [ ] **Step 1: Adicionar os imports**

Modificar o topo do arquivo (linhas 1–7):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
```

- [ ] **Step 2: Adicionar estado novo**

Modificar (linhas 44–45):

```tsx
  const [form, setForm] = useState<FormData>(emptyForm(tarefasPadrao))
  const [novaTarefa, setNovaTarefa] = useState('')
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>(tarefasPadrao)
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)
```

- [ ] **Step 3: Trocar `addTarefa` e adicionar `handleTipoCriado`**

Substituir (linhas 90–95):

```tsx
  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }
```

- [ ] **Step 4: Envolver o `return` num Fragment e renderizar o miniformulário**

Trocar a abertura do `return` (linha 138):

```tsx
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
```

E o fechamento (linhas 260–264):

```tsx
        </div>
      </div>
    </div>
    {nomeParaCriar && (
      <NovoTipoTarefaModal
        nome={nomeParaCriar}
        setor="pessoal"
        onCancel={() => setNomeParaCriar(null)}
        onCriado={handleTipoCriado}
      />
    )}
    </>
  )
}
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/pessoal/EmpresaPessoalModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/pessoal/EmpresaPessoalModal.tsx
git commit -m "feat: campo Tarefas do Pessoal abre miniformulario para nomes novos"
```

---

### Task 5: Ligar em `EmpresaModal.tsx` (Fiscal)

**Files:**
- Modify: `components/fiscal/EmpresaModal.tsx`

**Interfaces:**
- Consumes: `tarefaExisteNoCatalogo`, `NovoTipoTarefaModal`. Ao contrário de Contábil/Pessoal, este componente **não recebe** hoje nenhuma lista de nomes do catálogo Fiscal como prop — precisa buscar sozinho, porque os defaults de `tarefas_personalizadas` no Fiscal vêm de `atividade_templates`/`grupo_templades` (mecanismo separado), não do catálogo.

- [ ] **Step 1: Adicionar os imports**

Modificar o topo do arquivo (linhas 1–8):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import CamposFiscais, { type CamposFiscaisData } from './CamposFiscais'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
```

- [ ] **Step 2: Adicionar estado novo e o fetch do catálogo Fiscal**

Modificar (linhas 55–60):

```tsx
  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>([])
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)

  useEffect(() => {
    sb.from('tarefa_tipos').select('nome').eq('setor', 'fiscal').then(({ data }) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string))
    })
  }, [])
```

- [ ] **Step 3: Trocar `addTarefa` e adicionar `handleTipoCriado`**

Substituir (linhas 122–127):

```tsx
  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }
```

- [ ] **Step 4: Envolver o `return` num Fragment e renderizar o miniformulário**

Trocar a abertura do `return` (linha 176):

```tsx
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
```

E o fechamento (linhas 267–271):

```tsx
        </div>
      </div>
    </div>
    {nomeParaCriar && (
      <NovoTipoTarefaModal
        nome={nomeParaCriar}
        setor="fiscal"
        onCancel={() => setNomeParaCriar(null)}
        onCriado={handleTipoCriado}
      />
    )}
    </>
  )
}
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/fiscal/EmpresaModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/fiscal/EmpresaModal.tsx
git commit -m "feat: campo Tarefas do Fiscal (EmpresaModal) abre miniformulario para nomes novos"
```

---

### Task 6: Ligar na seção Fiscal de `ClienteGeralModal.tsx`

**Files:**
- Modify: `components/geral/ClienteGeralModal.tsx`

**Interfaces:**
- Consumes: `tarefaExisteNoCatalogo`, `NovoTipoTarefaModal`. Mesma situação de `EmpresaModal.tsx`: precisa buscar o catálogo Fiscal sozinho. O campo Tarefas deste modal só é editável quando `mostraFiscal && !isEdit` (criação de cliente novo pela tela "Clientes Geral") — na edição o bloco Fiscal é sempre somente-leitura, então `addTarefa` nunca é de fato invocado nesse caminho, mas a função continua existindo e é seguro deixá-la igual em ambos os casos.

- [ ] **Step 1: Adicionar os imports**

Modificar o topo do arquivo (linhas 1–10):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from '@/components/fiscal/CamposFiscais'
import SectorSection from '@/components/geral/SectorSection'
import { flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { SETORES, SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
```

- [ ] **Step 2: Adicionar estado novo e o fetch do catálogo Fiscal**

Modificar (linhas 48–54):

```tsx
  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarVinculos, setMostrarVinculos] = useState(false)
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>([])
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)

  useEffect(() => {
    sb.from('tarefa_tipos').select('nome').eq('setor', 'fiscal').then(({ data }) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string))
    })
  }, [])
```

- [ ] **Step 3: Trocar `addTarefa` e adicionar `handleTipoCriado`**

Substituir (linhas 116–121):

```tsx
  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }
```

- [ ] **Step 4: Envolver o `return` num Fragment e renderizar o miniformulário**

Trocar a abertura do `return` (linha 240):

```tsx
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
```

E o fechamento (linhas 387–391):

```tsx
        </div>
      </div>
    </div>
    {nomeParaCriar && (
      <NovoTipoTarefaModal
        nome={nomeParaCriar}
        setor="fiscal"
        onCancel={() => setNomeParaCriar(null)}
        onCriado={handleTipoCriado}
      />
    )}
    </>
  )
}
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos relacionados a `components/geral/ClienteGeralModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/geral/ClienteGeralModal.tsx
git commit -m "feat: campo Tarefas do Cliente Geral (Fiscal) abre miniformulario para nomes novos"
```

---

### Task 7: Verificação final ponta a ponta

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, todas as rotas existentes geradas (nenhuma rota nova foi criada por este plano).

- [ ] **Step 2: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

Em cada um dos 3 setores (Contábil, Pessoal, Fiscal), abrir "Novo Cliente"/"Nova Empresa" e:

1. No campo Tarefas, digitar um nome que já existe no catálogo daquele setor (ex: um nome já listado nas tags atuais) e apertar Enter — deve adicionar direto, sem abrir miniformulário (comportamento inalterado).
2. Digitar um nome novo, ex: `Teste Data <timestamp>`, apertar Enter — deve abrir o miniformulário. Escolher "Data", clicar "Criar tipo" — deve fechar o miniformulário e a tag aparecer na lista de Tarefas.
3. Digitar outro nome novo, ex: `Teste Opções <timestamp>`, escolher "Opções", adicionar 2-3 etapas (ex: "Gerar", "Enviar"), clicar "Criar tipo" — deve criar e adicionar a tag.
4. Digitar outro nome novo, ex: `Teste Texto <timestamp>`, escolher "Texto + anexo", clicar "Criar tipo" — deve criar e adicionar a tag.
5. Salvar o cliente. Abrir o cliente recém-criado na tela de detalhe do setor e conferir que as 3 tarefas novas renderizam com o formato correto (Data = checkbox simples; Opções = checklist com as etapas nomeadas; Texto = campo de texto + upload).
6. Só no Fiscal: tentar digitar exatamente `ENTRADA` ou `SAIDAS` como nome novo — o miniformulário deve abrir mas mostrar erro ao tentar criar ("nome reservado"), sem inserir nada no catálogo.
7. Repetir o passo 2 numa segunda aba/sessão simultânea com o mesmo nome novo (teste de corrida) — ambas devem terminar com sucesso, sem duplicar o tipo no catálogo (`select * from tarefa_tipos where setor = '<setor>' and nome = '<nome>'` deve retornar 1 linha só).

- [ ] **Step 3: Nota final**

Sem commit nesta task (só verificação). Se o Step 1 passar limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores, até decisão em contrário do usuário.
