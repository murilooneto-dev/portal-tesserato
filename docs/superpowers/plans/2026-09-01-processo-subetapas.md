# Subetapas no Cadastro de Processos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each etapa in a "Cadastro de Processos" tipo de processo have zero or more subetapas, each with its own formato de resposta (texto+anexo / checklist / data).

**Architecture:** Normalize `processo_tipos.etapas` (today a flat `text[]`) into two new relational tables, `processo_etapas` and `processo_subetapas`. Extract the row-shaping and form-state logic into a pure module (`lib/processo-tipos.ts`) that's unit tested in isolation; the `'use server'` actions file stays thin CRUD glue (matches the existing pattern in this codebase — server actions touching Supabase are verified manually, not unit tested); the UI component composes the pure helpers.

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + RLS), TypeScript, `node:test` + `node:assert/strict` for unit tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-01-processo-subetapas-design.md` — follow it exactly; this plan implements it.
- No edit of etapas/subetapas after a tipo de processo is created — only create-all-at-once or delete-the-whole-tipo (spec's explicit out-of-scope).
- `processo_tipos.etapas` (old `text[]` column) is dropped; confirmed empty in dev before this plan was written — no data migration needed.
- Reuse the existing `exigirAdmin()` pattern (see `lib/tarefa-tipos-actions.ts`) for every server action — never skip the admin check.
- Tailwind classes and visual style must match the existing `inputCls`/`labelCls` constants and button styles already used in `ProcessosTab.tsx` and `NovoTipoTarefaModal.tsx` — this is a catalog admin screen, not a place for new visual patterns.
- Migrations are applied manually against the dev Supabase project (no CLI/automated pipeline in this repo) — the plan pauses for that; do not attempt to script it.

---

### Task 1: Migration — `processo_etapas` and `processo_subetapas` tables

**Files:**
- Create: `supabase/migrations/027_processo_etapas_subetapas.sql`

**Interfaces:**
- Produces: tables `processo_etapas(id, processo_tipo_id, nome, ordem)` and `processo_subetapas(id, etapa_id, nome, tipo_resposta, ordem)`, both RLS-enabled with the same `is_admin()` policy pattern as every other catalog table in this repo (see `024_config_regimes_grupos_atividades.sql`). `processo_tipos.etapas` column is dropped.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/027_processo_etapas_subetapas.sql

-- Cada etapa de um tipo de processo (Societário) ganha subetapas com
-- formato de resposta próprio (texto+anexo / checklist / data) — mesma
-- linguagem visual do formulário de tipo de tarefa
-- (components/geral/NovoTipoTarefaModal.tsx), mas um conceito próprio da
-- subetapa. Isso exige normalizar "etapas" de text[] solto pra entidades
-- com ID (senão não dá pra pendurar subetapas nelas). Ver
-- docs/superpowers/specs/2026-09-01-processo-subetapas-design.md.
-- Mesmo padrão de RLS de 024_config_regimes_grupos_atividades.sql: leitura
-- livre pra autenticado, escrita só admin via is_admin().

create table processo_etapas (
  id                uuid primary key default gen_random_uuid(),
  processo_tipo_id  uuid references processo_tipos(id) on delete cascade not null,
  nome              text not null,
  ordem             integer not null default 0
);

create table processo_subetapas (
  id             uuid primary key default gen_random_uuid(),
  etapa_id       uuid references processo_etapas(id) on delete cascade not null,
  nome           text not null,
  tipo_resposta  text not null check (tipo_resposta in ('texto', 'checklist', 'data')),
  ordem          integer not null default 0
);

-- Tabela vazia em dev no momento desta migration (nenhum tipo de processo
-- real cadastrado ainda) — drop direto, sem backfill.
alter table processo_tipos drop column etapas;

alter table processo_etapas    enable row level security;
alter table processo_subetapas enable row level security;

create policy "Autenticados leem processo_etapas" on processo_etapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_etapas" on processo_etapas for all using (is_admin());

create policy "Autenticados leem processo_subetapas" on processo_subetapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_subetapas" on processo_subetapas for all using (is_admin());
```

- [ ] **Step 2: Confirm `processo_tipos` is empty in dev, then ask the user to apply the migration**

Before applying, run this read-only check against the dev Supabase project (via whatever method was used to verify earlier migrations in this branch — there is no local psql/CLI connection, so this is a manual check, e.g. Supabase Studio's table view or a `select count(*) from processo_tipos;` in the SQL Editor). If it returns 0 rows, proceed. If it returns any rows, stop and ask the user how to handle the existing data before dropping the column (do not silently drop real data).

Once confirmed empty, ask the user to run the migration SQL from Step 1 in the Supabase SQL Editor for the dev project (same flow used for migration 026 earlier in this branch's history — the assistant does not have DDL execution access to that database).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/027_processo_etapas_subetapas.sql
git commit -m "feat: migration de processo_etapas e processo_subetapas"
```

---

### Task 2: Pure module `lib/processo-tipos.ts` — types, row mapping, form helpers

**Files:**
- Create: `lib/processo-tipos.ts`
- Test: `tests/processo-tipos.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond its own types).
- Produces (consumed by Task 3 and Task 4):
  - `type SubetapaTipoResposta = 'texto' | 'checklist' | 'data'`
  - `interface SubetapaForm { nome: string; tipoResposta: SubetapaTipoResposta }`
  - `interface EtapaForm { nome: string; subetapas: SubetapaForm[] }`
  - `interface ProcessoSubetapaResumo { id: string; nome: string; tipoResposta: SubetapaTipoResposta }`
  - `interface ProcessoEtapaResumo { id: string; nome: string; subetapas: ProcessoSubetapaResumo[] }`
  - `interface ProcessoTipoResumo { id: string; nome: string; etapas: ProcessoEtapaResumo[] }`
  - `interface ProcessoTipoRow { id: string; nome: string; processo_etapas: { id: string; nome: string; ordem: number; processo_subetapas: { id: string; nome: string; tipo_resposta: SubetapaTipoResposta; ordem: number }[] }[] }`
  - `mapProcessoTipoRow(row: ProcessoTipoRow): ProcessoTipoResumo`
  - `adicionarEtapa(etapas: EtapaForm[], nome: string): EtapaForm[]`
  - `removerEtapa(etapas: EtapaForm[], index: number): EtapaForm[]`
  - `adicionarSubetapa(etapas: EtapaForm[], etapaIndex: number, nome: string, tipoResposta: SubetapaTipoResposta): EtapaForm[]`
  - `removerSubetapa(etapas: EtapaForm[], etapaIndex: number, subetapaIndex: number): EtapaForm[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/processo-tipos.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapProcessoTipoRow,
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  type EtapaForm,
  type ProcessoTipoRow,
} from '../lib/processo-tipos'

test('mapProcessoTipoRow: ordena etapas e subetapas por "ordem" e remapeia tipo_resposta pra camelCase', () => {
  const row: ProcessoTipoRow = {
    id: 'tipo-1',
    nome: 'Abertura de empresa',
    processo_etapas: [
      {
        id: 'etapa-2',
        nome: 'Registro na junta',
        ordem: 1,
        processo_subetapas: [],
      },
      {
        id: 'etapa-1',
        nome: 'Consulta de viabilidade',
        ordem: 0,
        processo_subetapas: [
          { id: 'sub-2', nome: 'Anexar comprovante', ordem: 1, tipo_resposta: 'texto' },
          { id: 'sub-1', nome: 'Data da consulta', ordem: 0, tipo_resposta: 'data' },
        ],
      },
    ],
  }

  const resultado = mapProcessoTipoRow(row)

  assert.deepEqual(resultado, {
    id: 'tipo-1',
    nome: 'Abertura de empresa',
    etapas: [
      {
        id: 'etapa-1',
        nome: 'Consulta de viabilidade',
        subetapas: [
          { id: 'sub-1', nome: 'Data da consulta', tipoResposta: 'data' },
          { id: 'sub-2', nome: 'Anexar comprovante', tipoResposta: 'texto' },
        ],
      },
      {
        id: 'etapa-2',
        nome: 'Registro na junta',
        subetapas: [],
      },
    ],
  })
})

test('mapProcessoTipoRow: tipo sem nenhuma etapa devolve lista vazia', () => {
  const row: ProcessoTipoRow = { id: 'tipo-1', nome: 'Vazio', processo_etapas: [] }
  assert.deepEqual(mapProcessoTipoRow(row), { id: 'tipo-1', nome: 'Vazio', etapas: [] })
})

test('adicionarEtapa: acrescenta etapa nova sem subetapas', () => {
  const resultado = adicionarEtapa([], 'Consulta de viabilidade')
  assert.deepEqual(resultado, [{ nome: 'Consulta de viabilidade', subetapas: [] }])
})

test('adicionarEtapa: corta espaços nas pontas', () => {
  const resultado = adicionarEtapa([], '  Registro na junta  ')
  assert.deepEqual(resultado, [{ nome: 'Registro na junta', subetapas: [] }])
})

test('adicionarEtapa: nome vazio (só espaço) não adiciona nada', () => {
  const etapas: EtapaForm[] = [{ nome: 'Existente', subetapas: [] }]
  assert.deepEqual(adicionarEtapa(etapas, '   '), etapas)
})

test('removerEtapa: remove só o índice pedido, preserva as outras', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [] },
    { nome: 'B', subetapas: [] },
    { nome: 'C', subetapas: [] },
  ]
  assert.deepEqual(removerEtapa(etapas, 1).map(e => e.nome), ['A', 'C'])
})

test('adicionarSubetapa: acrescenta subetapa só na etapa certa, sem tocar nas outras', () => {
  const etapas: EtapaForm[] = [
    { nome: 'A', subetapas: [] },
    { nome: 'B', subetapas: [] },
  ]
  const resultado = adicionarSubetapa(etapas, 1, 'Anexar contrato', 'texto')
  assert.deepEqual(resultado[0].subetapas, [])
  assert.deepEqual(resultado[1].subetapas, [{ nome: 'Anexar contrato', tipoResposta: 'texto' }])
})

test('adicionarSubetapa: corta espaços e ignora nome vazio', () => {
  const etapas: EtapaForm[] = [{ nome: 'A', subetapas: [] }]
  assert.deepEqual(adicionarSubetapa(etapas, 0, '  Conferir documento  ', 'checklist')[0].subetapas, [
    { nome: 'Conferir documento', tipoResposta: 'checklist' },
  ])
  assert.deepEqual(adicionarSubetapa(etapas, 0, '   ', 'checklist'), etapas)
})

test('removerSubetapa: remove só a subetapa pedida daquela etapa', () => {
  const etapas: EtapaForm[] = [
    {
      nome: 'A',
      subetapas: [
        { nome: 'Sub 1', tipoResposta: 'texto' },
        { nome: 'Sub 2', tipoResposta: 'data' },
      ],
    },
  ]
  const resultado = removerSubetapa(etapas, 0, 0)
  assert.deepEqual(resultado[0].subetapas, [{ nome: 'Sub 2', tipoResposta: 'data' }])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/processo-tipos.test.ts`
Expected: FAIL — `lib/processo-tipos.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/processo-tipos.ts`:

```ts
// lib/processo-tipos.ts

export type SubetapaTipoResposta = 'texto' | 'checklist' | 'data'

export interface SubetapaForm {
  nome: string
  tipoResposta: SubetapaTipoResposta
}

export interface EtapaForm {
  nome: string
  subetapas: SubetapaForm[]
}

export interface ProcessoSubetapaResumo {
  id: string
  nome: string
  tipoResposta: SubetapaTipoResposta
}

export interface ProcessoEtapaResumo {
  id: string
  nome: string
  subetapas: ProcessoSubetapaResumo[]
}

export interface ProcessoTipoResumo {
  id: string
  nome: string
  etapas: ProcessoEtapaResumo[]
}

// Shape cru devolvido pela query aninhada do Supabase (select com
// processo_etapas(...processo_subetapas(...))) — antes de ordenar por
// "ordem" e remapear tipo_resposta pra camelCase.
export interface ProcessoTipoRow {
  id: string
  nome: string
  processo_etapas: {
    id: string
    nome: string
    ordem: number
    processo_subetapas: {
      id: string
      nome: string
      tipo_resposta: SubetapaTipoResposta
      ordem: number
    }[]
  }[]
}

export function mapProcessoTipoRow(row: ProcessoTipoRow): ProcessoTipoResumo {
  return {
    id: row.id,
    nome: row.nome,
    etapas: [...row.processo_etapas]
      .sort((a, b) => a.ordem - b.ordem)
      .map(etapa => ({
        id: etapa.id,
        nome: etapa.nome,
        subetapas: [...etapa.processo_subetapas]
          .sort((a, b) => a.ordem - b.ordem)
          .map(sub => ({ id: sub.id, nome: sub.nome, tipoResposta: sub.tipo_resposta })),
      })),
  }
}

export function adicionarEtapa(etapas: EtapaForm[], nome: string): EtapaForm[] {
  const nomeTrim = nome.trim()
  if (!nomeTrim) return etapas
  return [...etapas, { nome: nomeTrim, subetapas: [] }]
}

export function removerEtapa(etapas: EtapaForm[], index: number): EtapaForm[] {
  return etapas.filter((_, i) => i !== index)
}

export function adicionarSubetapa(
  etapas: EtapaForm[],
  etapaIndex: number,
  nome: string,
  tipoResposta: SubetapaTipoResposta,
): EtapaForm[] {
  const nomeTrim = nome.trim()
  if (!nomeTrim) return etapas
  return etapas.map((etapa, i) =>
    i === etapaIndex ? { ...etapa, subetapas: [...etapa.subetapas, { nome: nomeTrim, tipoResposta }] } : etapa
  )
}

export function removerSubetapa(etapas: EtapaForm[], etapaIndex: number, subetapaIndex: number): EtapaForm[] {
  return etapas.map((etapa, i) =>
    i === etapaIndex ? { ...etapa, subetapas: etapa.subetapas.filter((_, si) => si !== subetapaIndex) } : etapa
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/processo-tipos.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `node --import tsx --test "tests/**/*.test.ts"`
Expected: PASS — all tests green (existing + the 9 new ones).

- [ ] **Step 6: Commit**

```bash
git add lib/processo-tipos.ts tests/processo-tipos.test.ts
git commit -m "feat: módulo puro de mapeamento e helpers de formulário pra etapas/subetapas"
```

---

### Task 3: Server actions — `lib/processo-tipos-actions.ts`

**Files:**
- Modify: `lib/processo-tipos-actions.ts` (full rewrite — current content only has `nome, etapas: string[]`, replaced entirely)

**Interfaces:**
- Consumes: `mapProcessoTipoRow`, `ProcessoTipoRow`, `ProcessoTipoResumo`, `EtapaForm` from `lib/processo-tipos.ts` (Task 2). `getAuthenticatedAdmin` from `@/lib/supabase/server` (existing).
- Produces (consumed by Task 4):
  - `listarProcessoTipos(): Promise<{ data: ProcessoTipoResumo[]; error: string | null }>`
  - `criarProcessoTipo(nome: string, etapas: EtapaForm[]): Promise<{ error: string | null }>`
  - `excluirProcessoTipo(id: string): Promise<{ error: string | null }>` (signature unchanged from before)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `lib/processo-tipos-actions.ts` with:

```ts
'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { mapProcessoTipoRow, type ProcessoTipoResumo, type ProcessoTipoRow, type EtapaForm } from '@/lib/processo-tipos'

export type { ProcessoTipoResumo } from '@/lib/processo-tipos'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarProcessoTipos(): Promise<{ data: ProcessoTipoResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('processo_tipos')
    .select('id, nome, processo_etapas(id, nome, ordem, processo_subetapas(id, nome, tipo_resposta, ordem))')
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []).map(row => mapProcessoTipoRow(row as unknown as ProcessoTipoRow)), error: null }
}

export async function criarProcessoTipo(nome: string, etapas: EtapaForm[]): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { data: tipoInserido, error: insertError } = await supabase
    .from('processo_tipos')
    .insert({ nome: nome.trim() })
    .select('id')
    .single()

  if (insertError) {
    // unique(nome): outra pessoa criou esse tipo nesse meio tempo — tratado
    // como sucesso, é exatamente o resultado que queríamos.
    if (insertError.code === '23505') return { error: null }
    return { error: insertError.message }
  }

  const processoTipoId = tipoInserido.id as string

  if (etapas.length > 0) {
    const { data: etapasInseridas, error: etapasError } = await supabase
      .from('processo_etapas')
      .insert(etapas.map((etapa, index) => ({ processo_tipo_id: processoTipoId, nome: etapa.nome, ordem: index })))
      .select('id')

    if (etapasError || !etapasInseridas) {
      await supabase.from('processo_tipos').delete().eq('id', processoTipoId)
      return { error: etapasError?.message ?? 'Não foi possível salvar as etapas.' }
    }

    // Postgres preserva a ordem das linhas retornadas por RETURNING (via
    // .select() aqui) igual à ordem de inserção de um INSERT multi-linha —
    // por isso é seguro casar etapasInseridas[i] com etapas[i] pelo índice.
    const subetapasParaInserir = etapas.flatMap((etapa, etapaIndex) =>
      etapa.subetapas.map((sub, subIndex) => ({
        etapa_id: etapasInseridas[etapaIndex].id as string,
        nome: sub.nome,
        tipo_resposta: sub.tipoResposta,
        ordem: subIndex,
      }))
    )

    if (subetapasParaInserir.length > 0) {
      const { error: subetapasError } = await supabase.from('processo_subetapas').insert(subetapasParaInserir)
      if (subetapasError) {
        await supabase.from('processo_tipos').delete().eq('id', processoTipoId)
        return { error: subetapasError.message }
      }
    }
  }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}

export async function excluirProcessoTipo(id: string): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: deleteError } = await supabase.from('processo_tipos').delete().eq('id', id)
  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/configuracoes/societario')
  return { error: null }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This file has no automated tests of its own — it's thin Supabase CRUD glue, verified manually in Task 5, matching how `lib/tarefa-tipos-actions.ts` is handled in this codebase.)

- [ ] **Step 3: Commit**

```bash
git add lib/processo-tipos-actions.ts
git commit -m "feat: server actions de processo_tipos passam a lidar com etapas/subetapas aninhadas"
```

---

### Task 4: UI — `ProcessosTab.tsx` with nested etapas/subetapas builder and expandable listing

**Files:**
- Modify: `app/admin/configuracoes/societario/ProcessosTab.tsx` (full rewrite)

**Interfaces:**
- Consumes: `listarProcessoTipos`, `criarProcessoTipo`, `excluirProcessoTipo` from `lib/processo-tipos-actions.ts` (Task 3); `adicionarEtapa`, `removerEtapa`, `adicionarSubetapa`, `removerSubetapa`, `type EtapaForm`, `type SubetapaTipoResposta`, `type ProcessoTipoResumo` from `lib/processo-tipos.ts` (Task 2).
- Produces: default export `ProcessosTab` (React component), same as before — `SocietarioConfigClient.tsx` already imports it with no prop changes needed.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/admin/configuracoes/societario/ProcessosTab.tsx` with:

```tsx
// app/admin/configuracoes/societario/ProcessosTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  listarProcessoTipos,
  criarProcessoTipo,
  excluirProcessoTipo,
} from '@/lib/processo-tipos-actions'
import {
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  type EtapaForm,
  type SubetapaTipoResposta,
  type ProcessoTipoResumo,
} from '@/lib/processo-tipos'

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

const FORMATOS_SUBETAPA: { value: SubetapaTipoResposta; label: string }[] = [
  { value: 'texto', label: 'Texto + anexo' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'data', label: 'Data' },
]

function labelFormato(tipo: SubetapaTipoResposta): string {
  return FORMATOS_SUBETAPA.find(f => f.value === tipo)?.label ?? tipo
}

function EtapaBloco({ etapa, onRemoverEtapa, onAdicionarSubetapa, onRemoverSubetapa }: {
  etapa: EtapaForm
  onRemoverEtapa: () => void
  onAdicionarSubetapa: (nome: string, tipoResposta: SubetapaTipoResposta) => void
  onRemoverSubetapa: (subetapaIndex: number) => void
}) {
  const [novaSubetapa, setNovaSubetapa] = useState('')
  const [formato, setFormato] = useState<SubetapaTipoResposta>('texto')

  function adicionar() {
    if (!novaSubetapa.trim()) return
    onAdicionarSubetapa(novaSubetapa, formato)
    setNovaSubetapa('')
  }

  return (
    <div className="rounded-lg border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-1 text-sm text-[var(--fg)]">{etapa.nome}</span>
        <button type="button" onClick={onRemoverEtapa}
          className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
      </div>

      {etapa.subetapas.length > 0 && (
        <ul className="space-y-1 mb-2">
          {etapa.subetapas.map((sub, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-[var(--fg)]/70 pl-3">
              <span className="flex-1">{sub.nome}</span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold">
                {labelFormato(sub.tipoResposta)}
              </span>
              <button type="button" onClick={() => onRemoverSubetapa(i)}
                className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold">×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5 mb-1.5">
        {FORMATOS_SUBETAPA.map(f => (
          <button key={f.value} type="button" onClick={() => setFormato(f.value)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              formato === f.value ? 'bg-[var(--accent)] text-[var(--fg)]' : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={novaSubetapa} onChange={e => setNovaSubetapa(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), adicionar())}
          placeholder="Nome da subetapa..."
          className={inputCls + ' flex-1 text-xs'} />
        <button type="button" onClick={adicionar}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-[10px] font-semibold transition-colors whitespace-nowrap">
          + Subetapa
        </button>
      </div>
    </div>
  )
}

export default function ProcessosTab() {
  const [itens, setItens] = useState<ProcessoTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [etapas, setEtapas] = useState<EtapaForm[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarProcessoTipos()
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  function addEtapa() {
    setEtapas(prev => adicionarEtapa(prev, novaEtapa))
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (!novoNome.trim() || etapas.length === 0) return
    setSalvando(true)
    const { error } = await criarProcessoTipo(novoNome, etapas)
    if (error) { setErro(error); setSalvando(false); return }
    setErro(null)
    setNovoNome('')
    setEtapas([])
    setSalvando(false)
    await recarregar()
  }

  async function handleExcluir(item: ProcessoTipoResumo) {
    if (!confirm(`Excluir o tipo de processo "${item.nome}"? Essa ação não pode ser desfeita.`)) return
    const { error } = await excluirProcessoTipo(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  function toggleExpandido(id: string) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div>
      <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4 mb-6">
        <label className={labelCls}>Nome do tipo de processo</label>
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          placeholder="Ex.: Abertura de empresa"
          className={inputCls + ' w-full mb-4'}
        />

        <label className={labelCls}>Etapas ({etapas.length})</label>
        <div className="mt-2 mb-3">
          {etapas.map((etapa, i) => (
            <EtapaBloco
              key={i}
              etapa={etapa}
              onRemoverEtapa={() => setEtapas(prev => removerEtapa(prev, i))}
              onAdicionarSubetapa={(nome, tipoResposta) => setEtapas(prev => adicionarSubetapa(prev, i, nome, tipoResposta))}
              onRemoverSubetapa={subetapaIndex => setEtapas(prev => removerSubetapa(prev, i, subetapaIndex))}
            />
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEtapa())}
            placeholder="Digitar nome da etapa e pressionar Enter..."
            className={inputCls + ' flex-1 text-xs'} />
          <button type="button" onClick={addEtapa}
            className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
            + Adicionar etapa
          </button>
        </div>

        <button
          onClick={handleCriar}
          disabled={salvando || !novoNome.trim() || etapas.length === 0}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {salvando ? 'Criando...' : '+ Criar tipo de processo'}
        </button>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          ⚠ {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-[var(--fg)]/40 text-sm">Nenhum tipo de processo cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => toggleExpandido(item.id)} className="flex-1 text-left">
                  <span className="block text-sm text-[var(--fg)]">{item.nome}</span>
                  <span className="block text-xs text-[var(--fg)]/40">
                    {item.etapas.length} etapa{item.etapas.length === 1 ? '' : 's'}
                  </span>
                </button>
                <button onClick={() => handleExcluir(item)} className="text-xs text-red-400/70 hover:text-red-400">
                  Excluir
                </button>
              </div>

              {expandidos[item.id] && (
                <div className="mt-3 pt-3 border-t border-[var(--fg)]/8 space-y-2">
                  {item.etapas.map(etapa => (
                    <div key={etapa.id}>
                      <span className="block text-xs font-semibold text-[var(--fg)]/70">{etapa.nome}</span>
                      {etapa.subetapas.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {etapa.subetapas.map(sub => (
                            <li key={sub.id} className="flex items-center gap-2 text-xs text-[var(--fg)]/50">
                              <span className="flex-1">{sub.nome}</span>
                              <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold">
                                {labelFormato(sub.tipoResposta)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `node --import tsx --test "tests/**/*.test.ts"`
Expected: PASS — no regressions (this task doesn't add tests; components aren't unit-tested in this codebase, matching existing convention — verified manually in Task 5).

- [ ] **Step 4: Commit**

```bash
git add app/admin/configuracoes/societario/ProcessosTab.tsx
git commit -m "feat: ProcessosTab ganha cadastro de subetapas por etapa e listagem expansível"
```

---

### Task 5: Manual browser verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server against the worktree**

Use an isolated port (this repo has concurrent sessions sharing the main checkout — do not touch the shared directory's dev server). From the worktree root:

```bash
NODE_PATH="../../node_modules" "../../node_modules/.bin/next" dev -p 3001
```

- [ ] **Step 2: Log in as the dev admin test user and open the Societário config**

Navigate to `http://localhost:3001/login`, sign in with `admin.dev@tesserato.local` / `DevAdmin@123` (dev-only test account), then go to `http://localhost:3001/admin/configuracoes/societario` → aba "Processos".

- [ ] **Step 3: Create a tipo de processo with mixed etapas/subetapas**

Create "Abertura de empresa" with:
- Etapa "Consulta de viabilidade" with two subetapas: "Data da consulta" (formato Data) and "Anexar comprovante" (formato Texto + anexo).
- Etapa "Registro na junta comercial" with no subetapas.

Confirm the create succeeds and the new item appears in the list with "2 etapas".

- [ ] **Step 4: Expand and verify the detail view**

Click the item to expand it. Confirm both etapas show, the first with its two subetapas and their correct formato labels (Data / Texto + anexo), the second with no subetapas section.

- [ ] **Step 5: Delete and confirm cascade cleanup**

Click "Excluir", confirm the dialog, confirm the item disappears from the list. (The `on delete cascade` on both new tables means the etapas/subetapas rows are gone too — no separate check needed beyond the UI no longer showing them.)

- [ ] **Step 6: Stop the dev server**

Kill the process started in Step 1.

---

## Self-Review Notes

- **Spec coverage:** Banco de dados section → Task 1. Server actions section → Task 3 (with the pure mapping/shaping logic pulled into Task 2 for testability, which the spec's "Server actions" section describes conceptually without mandating a specific file split). UI section → Task 4. Verification section → Task 5. Fora de escopo items (no edit/reorder, no execução screen) are not implemented anywhere in this plan, matching the spec.
- **Placeholder scan:** none found — every step has real code or a concrete manual instruction.
- **Type consistency:** `EtapaForm`/`SubetapaForm`/`SubetapaTipoResposta`/`ProcessoTipoResumo`/`ProcessoEtapaResumo`/`ProcessoSubetapaResumo` are defined once in Task 2 and imported by name (not redefined) in Tasks 3 and 4. `criarProcessoTipo(nome: string, etapas: EtapaForm[])` signature matches between Task 3's definition and Task 4's call site. `mapProcessoTipoRow` is defined in Task 2 and consumed only in Task 3.
