# Selos de vínculo (liberado/aguardando) na listagem de clientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nas 3 listagens de clientes (Fiscal/Contábil/Pessoal), ao lado do nome do cliente, aparece um selo por vínculo pendente entre setores — verde "✓ Liberada por {Setor}" se a tarefa de origem já foi concluída, laranja "⏳ Aguardando {Setor}" se ainda não — visualmente idêntico ao já usado dentro do checklist de tarefa, sem precisar abrir o cliente.

**Architecture:** Uma função nova em `lib/vinculos.ts` (`buscarPendenciasVinculoPorCliente`) calcula, pra todos os clientes de uma listagem de uma vez (não em loop por cliente), quais vínculos ativos têm a tarefa de destino (deste setor) ainda não concluída — retornando se cada um está liberado ou aguardando. As 3 páginas de listagem chamam essa função reaproveitando dados que já buscam hoje (clientes + tarefas do mês), e os 3 componentes de lista renderizam o selo correspondente ao lado do nome.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- O selo (liberado OU aguardando) só aparece enquanto a tarefa de destino (deste setor, no mês da listagem) ainda não está concluída — uma vez concluída, nenhum selo aparece mais pra aquele vínculo, independente do estado da origem.
- Markup do selo idêntico ao já usado em `components/fiscal/TarefaChecklist.tsx:306-316`: `text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap`, verde (`bg-green-500/15 text-green-400`) pra liberada, laranja (`bg-orange-500/15 text-orange-400`) pra aguardando, texto `✓ Liberada por {Setor}` / `⏳ Aguardando {Setor}`.
- `buscarVinculosDoCliente` (tela de detalhe do cliente) e o comportamento do checklist não mudam — a função nova é adicional, não substitui a existente.
- Sem N+1 query por cliente — a busca das pendências roda no máximo 1 query pros vínculos aplicáveis + 1 query por setor de origem distinto entre eles, pra listagem inteira.
- Societário/Financeiro fora de escopo (sem listagem de clientes funcional ainda).

---

### Task 1: Backend — `buscarPendenciasVinculoPorCliente` (`lib/vinculos.ts`)

**Files:**
- Modify: `lib/vinculos.ts`

**Interfaces:**
- Produces: `PendenciaVinculo { tipoDestino: string; tipoOrigem: string; setorOrigemLabel: string; liberada: boolean }` e `buscarPendenciasVinculoPorCliente(supabase, clientes, tarefasDestinoDoMes, setorAtual, mes, ano): Promise<Record<string, PendenciaVinculo[]>>` — consumidos pelas Tasks 2, 3 e 4.

- [ ] **Step 1: Atualizar o import no topo do arquivo**

Trocar:

```ts
// lib/vinculos.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { SETOR_LABEL, type UserSetor } from './types'
```

por:

```ts
// lib/vinculos.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { SETOR_LABEL, type UserSetor } from './types'
import { buscarTodasTarefasDoMes } from './tarefas-paginacao'
```

- [ ] **Step 2: Adicionar `PendenciaVinculo` e `buscarPendenciasVinculoPorCliente` no final do arquivo**

Depois da função `buscarVinculosDoCliente` (que não muda), adicionar:

```ts
export interface PendenciaVinculo {
  tipoDestino: string
  tipoOrigem: string
  setorOrigemLabel: string
  liberada: boolean
}

// Pra todos os clientes de uma listagem de uma vez (evita N+1 query):
// calcula, pra cada vínculo ativo do cliente cujo setor de destino é
// `setorAtual`, se a tarefa de destino (mesmo cliente, mesmo mês/ano)
// ainda NÃO está concluída — e nesse caso, se a tarefa de origem já
// está concluída (liberada) ou não (aguardando). Vínculos cuja tarefa
// de destino já está concluída não entram no resultado.
export async function buscarPendenciasVinculoPorCliente(
  supabase: SupabaseClient,
  clientes: { id: string; tarefas_vinculadas_ativas: string[] }[],
  tarefasDestinoDoMes: { cliente_id: string; tipo: string; concluida: boolean }[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, PendenciaVinculo[]>> {
  const idsVinculosAtivos = Array.from(new Set(clientes.flatMap(c => c.tarefas_vinculadas_ativas)))
  if (idsVinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', idsVinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const setoresOrigem = Array.from(new Set(vinculos.map(v => v.setor_origem as UserSetor)))
  const origemConcluidaPorSetor: Record<string, Record<string, boolean>> = {}
  for (const setorOrigem of setoresOrigem) {
    const tarefasOrigem = await buscarTodasTarefasDoMes<{ cliente_id: string; tipo: string; concluida: boolean }>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', setorOrigem
    )
    const mapa: Record<string, boolean> = {}
    for (const t of tarefasOrigem) mapa[`${t.cliente_id}||${t.tipo}`] = t.concluida
    origemConcluidaPorSetor[setorOrigem] = mapa
  }

  const destinoConcluida: Record<string, boolean> = {}
  for (const t of tarefasDestinoDoMes) destinoConcluida[`${t.cliente_id}||${t.tipo}`] = t.concluida

  const resultado: Record<string, PendenciaVinculo[]> = {}
  for (const c of clientes) {
    const vinculosDoCliente = vinculos.filter(v => c.tarefas_vinculadas_ativas.includes(v.id as string))
    for (const v of vinculosDoCliente) {
      const origemFeita = !!origemConcluidaPorSetor[v.setor_origem as string]?.[`${c.id}||${v.tipo_origem}`]
      const destinoFeita = !!destinoConcluida[`${c.id}||${v.tipo_destino}`]
      if (!destinoFeita) {
        if (!resultado[c.id]) resultado[c.id] = []
        resultado[c.id].push({
          tipoDestino: v.tipo_destino as string,
          tipoOrigem: v.tipo_origem as string,
          setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor],
          liberada: origemFeita,
        })
      }
    }
  }
  return resultado
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/vinculos.ts
git commit -m "feat: buscarPendenciasVinculoPorCliente calcula selos de vinculo para listagem inteira"
```

---

### Task 2: Fiscal — selo na listagem (`app/fiscal/clientes/page.tsx` + `components/fiscal/ClientesLista.tsx`)

**Files:**
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `components/fiscal/ClientesLista.tsx`

**Interfaces:**
- Consumes: `buscarPendenciasVinculoPorCliente`, `PendenciaVinculo` de `lib/vinculos.ts` (Task 1).

- [ ] **Step 1: Atualizar `app/fiscal/clientes/page.tsx`**

Trocar (arquivo inteiro):

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { mes, ano } = await getMesAno()

  const clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')

  const [{ data: clientesRaw }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  // Progresso por cliente
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [id, tipos] of Object.entries(tiposMap)) {
    progressoMap[id] = { total: tipos.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        templates={templatesMap}
      />
    </div>
  )
}
```

por:

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesLista from '@/components/fiscal/ClientesLista'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Fiscal' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { mes, ano } = await getMesAno()

  const clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')

  const [{ data: clientesRaw }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  // Progresso por cliente
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [id, tipos] of Object.entries(tiposMap)) {
    progressoMap[id] = { total: tipos.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
  )

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas ?? [],
    'fiscal',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesLista
        clientes={clientes}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        templates={templatesMap}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `components/fiscal/ClientesLista.tsx` — import e Props**

Trocar (linhas 1-9):

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import EmpresaModal from './EmpresaModal'
```

por:

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import type { PendenciaVinculo } from '@/lib/vinculos'
import EmpresaModal from './EmpresaModal'
```

Trocar a interface `Props` (linhas 36-43):

```tsx
interface Props {
  clientes: ClienteComFiscal[]
  comPendencia: Set<string>
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  templates: Record<string, string[]>
}
```

por:

```tsx
interface Props {
  clientes: ClienteComFiscal[]
  comPendencia: Set<string>
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  templates: Record<string, string[]>
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Trocar a assinatura da função (linha 47):

```tsx
export default function ClientesLista({ clientes, comPendencia, progressoMap, mes, ano, templates }: Props) {
```

por:

```tsx
export default function ClientesLista({ clientes, comPendencia, progressoMap, mes, ano, templates, pendenciasVinculo }: Props) {
```

- [ ] **Step 3: Renderizar os selos ao lado do nome**

Trocar (linhas 165-176):

```tsx
              {/* Nome + CNPJ */}
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.cnpj && (
                    <span className="text-[var(--fg)]/40 font-normal mr-1.5">
                      {cliente.cnpj.replace(/^(\d{2})\.?(\d{3})\.?(\d{3}).*/, '$1.$2.$3')}
                    </span>
                  )}
                  {cliente.nome}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

por:

```tsx
              {/* Nome + CNPJ */}
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.cnpj && (
                    <span className="text-[var(--fg)]/40 font-normal mr-1.5">
                      {cliente.cnpj.replace(/^(\d{2})\.?(\d{3})\.?(\d{3}).*/, '$1.$2.$3')}
                    </span>
                  )}
                  {cliente.nome}
                  {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
                    <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      p.liberada ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {p.liberada ? `✓ Liberada por ${p.setorOrigemLabel}` : `⏳ Aguardando ${p.setorOrigemLabel}`}
                    </span>
                  ))}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/clientes/page.tsx components/fiscal/ClientesLista.tsx
git commit -m "feat: listagem do Fiscal mostra selo de vinculo liberado/aguardando ao lado do nome"
```

---

### Task 3: Contábil — selo na listagem (`app/contabil/clientes/page.tsx` + `components/contabil/ClientesListaContabil.tsx`)

**Files:**
- Modify: `app/contabil/clientes/page.tsx`
- Modify: `components/contabil/ClientesListaContabil.tsx`

**Interfaces:**
- Consumes: `buscarPendenciasVinculoPorCliente`, `PendenciaVinculo` de `lib/vinculos.ts` (Task 1).

- [ ] **Step 1: Atualizar `app/contabil/clientes/page.tsx`**

Trocar (arquivo inteiro):

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesListaContabil from '@/components/contabil/ClientesListaContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Contábil' }

export default async function ClientesContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = { total: c.tarefas_personalizadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(c.tarefas_personalizadas)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaContabil
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
      />
    </div>
  )
}
```

por:

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesListaContabil from '@/components/contabil/ClientesListaContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Contábil' }

export default async function ClientesContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = { total: c.tarefas_personalizadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(c.tarefas_personalizadas)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas,
    'contabil',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaContabil
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `components/contabil/ClientesListaContabil.tsx` — import e Props**

Trocar (linhas 1-7):

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import EmpresaContabilModal from './EmpresaContabilModal'
```

por:

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { PendenciaVinculo } from '@/lib/vinculos'
import EmpresaContabilModal from './EmpresaContabilModal'
```

Trocar a interface `Props` (linhas 18-24):

```tsx
interface Props {
  clientes: ClienteComContabil[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
}
```

por:

```tsx
interface Props {
  clientes: ClienteComContabil[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Trocar a assinatura da função (linha 28):

```tsx
export default function ClientesListaContabil({ clientes, progressoMap, mes, ano, tarefasPadrao }: Props) {
```

por:

```tsx
export default function ClientesListaContabil({ clientes, progressoMap, mes, ano, tarefasPadrao, pendenciasVinculo }: Props) {
```

- [ ] **Step 3: Renderizar os selos ao lado do nome**

Trocar (bloco do nome do cliente, hoje):

```tsx
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">{cliente.nome}</p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

por:

```tsx
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.nome}
                  {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
                    <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      p.liberada ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {p.liberada ? `✓ Liberada por ${p.setorOrigemLabel}` : `⏳ Aguardando ${p.setorOrigemLabel}`}
                    </span>
                  ))}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/contabil/clientes/page.tsx components/contabil/ClientesListaContabil.tsx
git commit -m "feat: listagem do Contabil mostra selo de vinculo liberado/aguardando ao lado do nome"
```

---

### Task 4: Pessoal — selo na listagem (`app/pessoal/clientes/page.tsx` + `components/pessoal/ClientesListaPessoal.tsx`)

**Files:**
- Modify: `app/pessoal/clientes/page.tsx`
- Modify: `components/pessoal/ClientesListaPessoal.tsx`

**Interfaces:**
- Consumes: `buscarPendenciasVinculoPorCliente`, `PendenciaVinculo` de `lib/vinculos.ts` (Task 1).

- [ ] **Step 1: Atualizar `app/pessoal/clientes/page.tsx`**

Trocar (arquivo inteiro):

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesListaPessoal from '@/components/pessoal/ClientesListaPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Pessoal' }

export default async function ClientesPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(c.tarefas_personalizadas, mesesVisiveisPorTipo, mes)
    progressoMap[c.id] = { total: visiveis.length, concluidas: 0 }
    tiposMap[c.id] = new Set(visiveis)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaPessoal
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
      />
    </div>
  )
}
```

por:

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesListaPessoal from '@/components/pessoal/ClientesListaPessoal'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { buscarPendenciasVinculoPorCliente } from '@/lib/vinculos'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { filtrarTarefasVisiveis } from '@/lib/tarefa-tipos'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Pessoal' }

export default async function ClientesPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClientePessoal)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const mesesVisiveisPorTipo: Record<string, number[] | null> = {}
  for (const t of tiposRaw ?? []) mesesVisiveisPorTipo[t.nome as string] = t.meses_visiveis as number[] | null

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(c.tarefas_personalizadas, mesesVisiveisPorTipo, mes)
    progressoMap[c.id] = { total: visiveis.length, concluidas: 0 }
    tiposMap[c.id] = new Set(visiveis)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const pendenciasVinculo = await buscarPendenciasVinculoPorCliente(
    supabase,
    clientes.map(c => ({ id: c.id, tarefas_vinculadas_ativas: c.tarefas_vinculadas_ativas })),
    tarefas,
    'pessoal',
    mes,
    ano,
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaPessoal
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        pendenciasVinculo={pendenciasVinculo}
      />
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `components/pessoal/ClientesListaPessoal.tsx` — import e Props**

Trocar (linhas 1-7):

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'
import EmpresaPessoalModal from './EmpresaPessoalModal'
```

por:

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'
import type { PendenciaVinculo } from '@/lib/vinculos'
import EmpresaPessoalModal from './EmpresaPessoalModal'
```

Trocar a interface `Props` (linhas 18-24):

```tsx
interface Props {
  clientes: ClienteComPessoal[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
}
```

por:

```tsx
interface Props {
  clientes: ClienteComPessoal[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Trocar a assinatura da função (linha 28):

```tsx
export default function ClientesListaPessoal({ clientes, progressoMap, mes, ano, tarefasPadrao }: Props) {
```

por:

```tsx
export default function ClientesListaPessoal({ clientes, progressoMap, mes, ano, tarefasPadrao, pendenciasVinculo }: Props) {
```

- [ ] **Step 3: Renderizar os selos ao lado do nome**

Trocar (bloco do nome do cliente, hoje):

```tsx
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">{cliente.nome}</p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

por:

```tsx
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">
                  {cliente.nome}
                  {(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
                    <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      p.liberada ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {p.liberada ? `✓ Liberada por ${p.setorOrigemLabel}` : `⏳ Aguardando ${p.setorOrigemLabel}`}
                    </span>
                  ))}
                </p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/pessoal/clientes/page.tsx components/pessoal/ClientesListaPessoal.tsx
git commit -m "feat: listagem do Pessoal mostra selo de vinculo liberado/aguardando ao lado do nome"
```

---

### Task 5: Verificação final

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, mesmas rotas de antes (nenhuma rota nova ou removida).

- [ ] **Step 2: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Em `/vinculos` (admin), criar um vínculo de teste entre um tipo de tarefa de um setor (origem) e um tipo de outro setor (destino).
2. Em `/clientes` (admin), ativar esse vínculo pra um cliente de teste que tenha os dois setores.
3. Abrir a listagem do setor de destino (`/fiscal/clientes`, `/contabil/clientes` ou `/pessoal/clientes`, conforme o vínculo criado) — com a tarefa de origem ainda não concluída, confirmar que aparece o selo laranja "⏳ Aguardando {Setor}" ao lado do nome do cliente.
4. No setor de origem, marcar a tarefa de origem daquele cliente/mês como concluída.
5. Voltar pra listagem do setor de destino e confirmar que o selo virou verde "✓ Liberada por {Setor}".
6. No setor de destino, marcar a tarefa vinculada como concluída — confirmar que o selo some da listagem.
7. Repetir com um segundo vínculo ativo no mesmo cliente, confirmar que aparecem dois selos lado a lado.

- [ ] **Step 3: Nota final**

Sem commit nesta task (só verificação). Se o Step 1 passar limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores.
