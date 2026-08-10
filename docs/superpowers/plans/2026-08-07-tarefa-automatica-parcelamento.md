# Tarefa Automática de Parcelamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the monthly "data de emissão/envio" fields of a parcelamento (today free-text inputs only on the Parcelamentos screen) into a real checklist task on the Fiscal/Pessoal client ficha, created reactively (no cron) and counted in both the ficha's and the dashboard's completion percentage.

**Architecture:** A new shared module (`lib/parcelamento-tarefas.ts`) owns all parcelamento↔tarefa logic: computing the synthetic task name, syncing missing tasks into `tarefas` on page load (ficha or dashboard), and writing the checklist date back into the matching `parcelamentos.<mes>` column. Client ficha pages call the sync function before reading `tarefas`, then merge the resulting parcelamento-derived task names into the list passed to the existing checklist components — reproducing each sector's existing fallback logic first, so completion percentages stay correct everywhere without touching the checklist components' rendering logic.

**Tech Stack:** Next.js 16 (server components + inline `'use server'` actions), Supabase/Postgres (`@supabase/supabase-js` v2), `node --test` + `tsx` for unit tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-tarefa-automatica-parcelamento-design.md` — every task below implements one numbered section of it.
- Never overwrite an existing `tarefas` row when syncing — only fill what's missing (spec §4.5).
- Only Fiscal and Pessoal generate tasks this delivery; Contábil checkbox exists but has no effect (spec §1, "Fora de escopo").
- Migrations run against the **dev** Supabase project only in this plan — do not touch production (per project convention; production migrations are applied manually later by the user).
- Next migration number is `022` — `supabase/migrations/` already has two `019_*.sql` files and goes up to `021_*.sql`; always `ls` the directory before numbering, don't assume "last + 1".
- This repo's `AGENTS.md` warns this Next.js version has breaking changes vs. training data — none of the APIs touched in this plan (server components, inline `'use server'` actions, route handlers) are new usage, all patterns are copied from existing code in this codebase.

---

### Task 1: Migration 022 — schema for parcelamento setores + tarefa link

**Files:**
- Create: `supabase/migrations/022_parcelamento_tarefa_automatica.sql`

**Interfaces:**
- Produces: `parcelamentos.setores text[] not null default '{}'`, `tarefas.parcelamento_id uuid references parcelamentos(id) on delete cascade` — every later task in this plan depends on both columns existing in the dev database.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/022_parcelamento_tarefa_automatica.sql

begin;

-- Setores em que o parcelamento gera tarefa na ficha do cliente (spec
-- 2026-08-07, item 1). Só Fiscal e Pessoal de fato geram tarefa nesta
-- entrega — Contábil fica disponível no cadastro sem efeito ainda.
alter table parcelamentos add column if not exists setores text[] not null default '{}';

-- Liga uma tarefa à parcelamento que a originou. Nullable: tarefas normais
-- (não geradas por parcelamento) continuam com esse campo null. Cascade:
-- apagar o parcelamento apaga as tarefas que ele gerou (spec item 2).
alter table tarefas add column if not exists parcelamento_id uuid references parcelamentos(id) on delete cascade;

create index if not exists idx_tarefas_parcelamento_id on tarefas (parcelamento_id);

commit;
```

- [ ] **Step 2: Apply the migration to the dev Supabase project**

Read the dev project's credentials from `../portal-tesserato/.env.development.local` (this worktree does not carry env files — they're gitignored and only exist in the main checkout). Apply the SQL the same way migration `021_parcelamento_secoes_catalogo.sql` was applied to dev (REST/direct SQL execution against the dev project, not the CLI). Do not touch production.

- [ ] **Step 3: Verify the columns exist**

Query `information_schema.columns` (or equivalent) on the dev project for `parcelamentos.setores` and `tarefas.parcelamento_id`. Confirm both are present with the expected types before continuing — every later task assumes these columns exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/022_parcelamento_tarefa_automatica.sql
git commit -m "feat: schema para tarefa automatica de parcelamento (setores + parcelamento_id)"
```

---

### Task 2: `lib/parcelamento-tarefas.ts` — pure helpers (name computation, date formatting)

**Files:**
- Create: `lib/parcelamento-tarefas.ts`
- Test: `tests/parcelamento-tarefas.test.ts`

**Interfaces:**
- Produces: `MES_PARA_COLUNA: Record<number, string>`, `isoParaDdMm(iso: string): string`, `ddMmParaIso(ddMm: string, ano: number): string | null`, `nomeTarefaParcelamento(secao: string, localTipo: string | null, desambiguar: boolean): string` — Task 3 builds `sincronizarTarefasParcelamento` on top of these; Tasks 5–8 import `isoParaDdMm` directly.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/parcelamento-tarefas.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MES_PARA_COLUNA, isoParaDdMm, ddMmParaIso, nomeTarefaParcelamento } from '../lib/parcelamento-tarefas'

test('MES_PARA_COLUNA mapeia os 12 meses pras colunas de parcelamentos (set, nao sep)', () => {
  assert.equal(MES_PARA_COLUNA[1], 'jan')
  assert.equal(MES_PARA_COLUNA[9], 'set')
  assert.equal(MES_PARA_COLUNA[12], 'dez')
})

test('isoParaDdMm converte yyyy-mm-dd pra dd/mm', () => {
  assert.equal(isoParaDdMm('2026-08-07'), '07/08')
  assert.equal(isoParaDdMm('2026-01-31'), '31/01')
})

test('ddMmParaIso converte dd/mm + ano pra ISO completo', () => {
  const iso = ddMmParaIso('07/08', 2026)
  assert.ok(iso)
  assert.ok(iso!.startsWith('2026-08-07'))
})

test('ddMmParaIso retorna null pra texto invalido', () => {
  assert.equal(ddMmParaIso('nao é uma data', 2026), null)
  assert.equal(ddMmParaIso('', 2026), null)
})

test('nomeTarefaParcelamento sem desambiguacao usa so a secao', () => {
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', 'SEQ 4394823', false), 'Parcelamentos (PGFN - ECAC)')
})

test('nomeTarefaParcelamento com desambiguacao inclui local/tipo', () => {
  assert.equal(
    nomeTarefaParcelamento('PGFN - ECAC', 'SEQ 4394823', true),
    'Parcelamentos (PGFN - ECAC / SEQ 4394823)',
  )
})

test('nomeTarefaParcelamento com desambiguacao mas sem local/tipo cai pro nome base', () => {
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', null, true), 'Parcelamentos (PGFN - ECAC)')
  assert.equal(nomeTarefaParcelamento('PGFN - ECAC', '  ', true), 'Parcelamentos (PGFN - ECAC)')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/parcelamento-tarefas'`

- [ ] **Step 3: Write the module (pure functions only for now)**

```ts
// lib/parcelamento-tarefas.ts

// Mapeia mes numerico (1-12) pra coluna dd/mm em `parcelamentos`, na mesma
// ordem usada em app/fiscal/parcelamentos/page.tsx (MESES_COLS). Setembro é
// "set", não "sep" — segue a nomenclatura já cadastrada no banco.
export const MES_PARA_COLUNA: Record<number, string> = {
  1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
  7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez',
}

// "yyyy-mm-dd" -> "dd/mm" (formato usado nas colunas de mes de parcelamentos,
// que nunca guardam ano — decisão do usuário 2026-08-05).
export function isoParaDdMm(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

// "dd/mm" + ano -> ISO 8601 completo, mesmo formato usado em `concluida_em`
// pelas demais tarefas (ver toggleTarefa/toggleTarefaPessoal). Retorna null
// pra texto que não é uma data dd/mm válida.
export function ddMmParaIso(ddMm: string, ano: number): string | null {
  const partes = ddMm.split('/')
  if (partes.length !== 2) return null
  const [dia, mes] = partes
  if (!/^\d{1,2}$/.test(dia) || !/^\d{1,2}$/.test(mes)) return null
  const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return dateObj.toISOString()
}

// Nome da tarefa sintética gerada a partir de um parcelamento (spec item 3).
// `desambiguar` é decidido por quem chama (sincronizarTarefasParcelamento),
// que sabe se o cliente tem 2+ parcelamentos na mesma seção.
export function nomeTarefaParcelamento(
  secao: string,
  localTipo: string | null,
  desambiguar: boolean,
): string {
  if (desambiguar && localTipo && localTipo.trim() !== '') {
    return `Parcelamentos (${secao} / ${localTipo.trim()})`
  }
  return `Parcelamentos (${secao})`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 7 tests in `tests/parcelamento-tarefas.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/parcelamento-tarefas.ts tests/parcelamento-tarefas.test.ts
git commit -m "feat: helpers puros de nome/data para tarefa automatica de parcelamento"
```

---

### Task 3: `sincronizarTarefasParcelamento` + `gravarDataParcelamento` (DB-touching)

**Files:**
- Modify: `lib/parcelamento-tarefas.ts`

**Interfaces:**
- Consumes: `MES_PARA_COLUNA`, `nomeTarefaParcelamento`, `ddMmParaIso` (Task 2); `getAuthenticatedAdmin` from `lib/supabase/server.ts` (`{ user, supabase } = await getAuthenticatedAdmin()`, `supabase` is `null` if unauthenticated); `UserSetor` type from `lib/types.ts`.
- Produces: `sincronizarTarefasParcelamento(supabase: SupabaseClient, setor: 'fiscal' | 'pessoal', mes: number, ano: number): Promise<void>` — called by Tasks 5, 7, 9. `gravarDataParcelamento(supabase: SupabaseClient, parcelamentoId: string, mes: number, valorDdMm: string | null): Promise<void>` — called by Tasks 5, 6, 8.

This task has no automated test: it's pure DB I/O against Supabase (reads `parcelamentos`/`clientes`/`clientes_fiscal`/`clientes_pessoal`, writes `tarefas`), the same category of code this project already leaves untested (`app/fiscal/clientes/actions.ts` etc. have no unit tests — only pure logic and static-analysis-style files under `tests/` are covered, e.g. `tests/setor-layouts.test.ts`). Verification is via `tsc --noEmit` plus the manual browser check in Task 11.

- [ ] **Step 1: Add the DB-touching functions to `lib/parcelamento-tarefas.ts`**

Append to the file created in Task 2:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedAdmin } from './supabase/server'
import type { UserSetor } from './types'

// Grava (ou limpa, se valorDdMm=null) a data de um mes de parcelamento —
// chamado depois que uma tarefa com parcelamento_id é marcada/desmarcada
// no checklist da ficha (spec item 5).
export async function gravarDataParcelamento(
  supabase: SupabaseClient,
  parcelamentoId: string,
  mes: number,
  valorDdMm: string | null,
): Promise<void> {
  const coluna = MES_PARA_COLUNA[mes]
  if (!coluna) return
  await supabase.from('parcelamentos').update({ [coluna]: valorDdMm }).eq('id', parcelamentoId)
}

interface ParcelamentoRow {
  id: string
  cnpj: string | null
  secao: string
  local_tipo: string | null
  [coluna: string]: unknown
}

// Cria, em `tarefas`, uma linha pra cada parcelamento "EM ANDAMENTO" do
// setor informado que ainda não tem tarefa pro mes/ano em questão. Nunca
// sobrescreve uma tarefa já existente (spec item 4) — o upsert com
// ignoreDuplicates faz isso de forma atômica, inclusive contra corrida
// entre duas páginas carregando ao mesmo tempo.
export async function sincronizarTarefasParcelamento(
  supabase: SupabaseClient,
  setor: Extract<UserSetor, 'fiscal' | 'pessoal'>,
  mes: number,
  ano: number,
): Promise<void> {
  const coluna = MES_PARA_COLUNA[mes]
  if (!coluna) return

  const { data: parcelamentosRaw } = await supabase
    .from('parcelamentos')
    .select(`id, cnpj, secao, local_tipo, ${coluna}`)
    .eq('status', 'EM ANDAMENTO')
    .contains('setores', [setor])

  const parcelamentos = (parcelamentosRaw ?? []) as ParcelamentoRow[]
  if (parcelamentos.length === 0) return

  // Resolve cnpj -> cliente_id só entre clientes que realmente tem linha na
  // tabela de extensão desse setor (spec item 4.2 — inner join proposital).
  const tabelaExtensao = setor === 'fiscal' ? 'clientes_fiscal' : 'clientes_pessoal'
  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select(`id, cnpj, ${tabelaExtensao}!inner(cliente_id)`)
    .not('cnpj', 'is', null)

  const clienteIdPorCnpj = new Map<string, string>()
  for (const c of (clientesRaw ?? []) as { id: string; cnpj: string }[]) {
    clienteIdPorCnpj.set(c.cnpj, c.id)
  }

  const resolvidos = parcelamentos
    .map(p => ({ parcelamento: p, clienteId: p.cnpj ? clienteIdPorCnpj.get(p.cnpj) : undefined }))
    .filter((r): r is { parcelamento: ParcelamentoRow; clienteId: string } => !!r.clienteId)

  if (resolvidos.length === 0) return

  // Agrupa por cliente+secao pra decidir quem precisa de desambiguacao por
  // local/tipo (spec item 3 — acontece quando o mesmo cliente tem 2+
  // parcelamentos na mesma secao).
  const contagemGrupo = new Map<string, number>()
  for (const { parcelamento, clienteId } of resolvidos) {
    const chave = `${clienteId}::${parcelamento.secao}`
    contagemGrupo.set(chave, (contagemGrupo.get(chave) ?? 0) + 1)
  }

  const novasTarefas = resolvidos.map(({ parcelamento, clienteId }) => {
    const chave = `${clienteId}::${parcelamento.secao}`
    const desambiguar = (contagemGrupo.get(chave) ?? 0) > 1
    const tipo = nomeTarefaParcelamento(parcelamento.secao, parcelamento.local_tipo, desambiguar)
    const valorMes = (parcelamento[coluna] as string | null) ?? null
    const concluida = !!valorMes
    const concluida_em = concluida ? ddMmParaIso(valorMes!, ano) : null
    return {
      cliente_id: clienteId,
      usuario_id: null,
      mes,
      ano,
      tipo,
      setor,
      concluida,
      concluida_em,
      parcelamento_id: parcelamento.id,
    }
  })

  const { supabase: admin } = await getAuthenticatedAdmin()
  if (!admin) return

  await admin.from('tarefas').upsert(novasTarefas, {
    onConflict: 'cliente_id,mes,ano,tipo,setor',
    ignoreDuplicates: true,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `lib/parcelamento-tarefas.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/parcelamento-tarefas.ts
git commit -m "feat: sincronizacao reativa de tarefas de parcelamento"
```

---

### Task 4: Extract Fiscal's fallback task list into `lib/tarefa-tipos.ts`

Fiscal's `TarefaChecklist.tsx` has an internal fallback (`TAREFAS_NORMAL`/`SIMPLES`/`MEI` + `getTiposParaGrupo`) used when a client has no `tarefas_personalizadas`. Task 5 needs the exact same fallback logic in a server component (the ficha page) to build the merged list *before* handing it to the component — per the architecture decision, reproducing the fallback is what keeps the ficha's top-of-page percentage correct without breaking clients that rely on it. This task moves that logic to the shared `lib/tarefa-tipos.ts` (already used by Pessoal for its own tarefa-visibility helpers) so both the component and the page import the same source of truth — no duplicated list to drift out of sync.

**Files:**
- Modify: `lib/tarefa-tipos.ts`
- Modify: `components/fiscal/TarefaChecklist.tsx`

**Interfaces:**
- Produces: `getTiposParaGrupoFiscal(grupo: string): string[]` — consumed by Task 5 and by the refactored `TarefaChecklist.tsx`.

- [ ] **Step 1: Add the fallback lists and function to `lib/tarefa-tipos.ts`**

```ts
// lib/tarefa-tipos.ts — append at the end of the file

// Fallback do setor Fiscal: usado só quando o cliente não tem
// `tarefas_personalizadas` cadastradas (comportamento legado, anterior ao
// catálogo por cliente). Compartilhado entre TarefaChecklist.tsx (que
// renderiza) e a ficha do cliente (que precisa saber a lista efetiva antes
// de mesclar tarefas de parcelamento nela).
export const TAREFAS_FISCAL_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
export const TAREFAS_FISCAL_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
export const TAREFAS_FISCAL_MEI     = ['DAS']

export function getTiposParaGrupoFiscal(grupo: string): string[] {
  if (grupo === 'simples') return TAREFAS_FISCAL_SIMPLES
  if (grupo === 'mei')     return TAREFAS_FISCAL_MEI
  return TAREFAS_FISCAL_NORMAL
}
```

- [ ] **Step 2: Update `components/fiscal/TarefaChecklist.tsx` to import instead of defining locally**

Replace (`components/fiscal/TarefaChecklist.tsx:9-17`):

```ts
const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
const TAREFAS_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
const TAREFAS_MEI     = ['DAS']

function getTiposParaGrupo(grupo: string) {
  if (grupo === 'simples') return TAREFAS_SIMPLES
  if (grupo === 'mei')     return TAREFAS_MEI
  return TAREFAS_NORMAL
}
```

with:

```ts
import { getTiposParaGrupoFiscal } from '@/lib/tarefa-tipos'
```

(add this import near the top of the file, alongside the other imports on lines 1-7)

Then replace the single usage on line 119:

```ts
const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupo(grupo)
```

with:

```ts
const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupoFiscal(grupo)
```

- [ ] **Step 3: Typecheck and run existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all existing tests still pass (this is a pure refactor — no behavior change)

- [ ] **Step 4: Commit**

```bash
git add lib/tarefa-tipos.ts components/fiscal/TarefaChecklist.tsx
git commit -m "refactor: extrai fallback de tarefas fiscal para lib/tarefa-tipos.ts"
```

---

### Task 5: Fiscal ficha do cliente — sincronização + merge + gravação de volta

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `sincronizarTarefasParcelamento`, `gravarDataParcelamento`, `isoParaDdMm` (Task 3, Task 2); `getTiposParaGrupoFiscal` (Task 4).

- [ ] **Step 1: Add imports**

At the top of `app/fiscal/clientes/[id]/page.tsx`, alongside the existing imports (near line 10):

```ts
import { sincronizarTarefasParcelamento, gravarDataParcelamento, isoParaDdMm } from '@/lib/parcelamento-tarefas'
import { getTiposParaGrupoFiscal } from '@/lib/tarefa-tipos'
```

- [ ] **Step 2: Call the sync before fetching tarefas**

Insert right after `const { mes, ano } = await getMesAno()` (line 46), before the "Tarefas do mês selecionado" query (line 51):

```ts
  const { mes, ano } = await getMesAno()
  await sincronizarTarefasParcelamento(supabase, 'fiscal', mes, ano)
```

- [ ] **Step 3: Compute the merged task list after `tarefas` is fetched**

Insert after the `tarefas` query (after line 52, before the `tarefaTipos` block):

```ts
  const tarefasPersonalizadasBrutas = cliente.tarefas_personalizadas ?? []
  const tarefasBaseFiscal = tarefasPersonalizadasBrutas.length > 0
    ? tarefasPersonalizadasBrutas
    : getTiposParaGrupoFiscal(cliente.grupo ?? 'normal')
  const tiposDeParcelamento = Array.from(new Set(
    (tarefas ?? []).filter(t => t.parcelamento_id).map(t => t.tipo)
  ))
  const tarefasPersonalizadasEfetivas = [...tarefasBaseFiscal, ...tiposDeParcelamento]
```

- [ ] **Step 4: Pass the merged list to `TarefaChecklist`**

Replace (in the `<TarefaChecklist ... />` block, around line 221):

```tsx
        tarefasPersonalizadas={cliente.tarefas_personalizadas ?? []}
```

with:

```tsx
        tarefasPersonalizadas={tarefasPersonalizadasEfetivas}
```

- [ ] **Step 5: Write the date back to `parcelamentos` in `toggleTarefa`**

Replace the whole `toggleTarefa` function (lines 122-147):

```ts
  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    if (!(await podeEditarCliente(id))) return
    const { user, supabase } = await getAuthenticatedAdmin()
    if (!supabase) return
    const concluida_em = concluida
      ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
      : null
    const { data: existing } = await supabase
      .from('tarefas').select('id')
      .eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('tarefas')
        .update({ concluida, concluida_em })
        .eq('id', existing.id)
    } else {
      await supabase.from('tarefas')
        .insert({ cliente_id: id, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida, concluida_em })
    }
    revalidatePath(`/fiscal/clientes/${id}`)
    revalidatePath('/fiscal/clientes')
    revalidatePath('/fiscal/dashboard')
    revalidatePath('/fiscal/relatorios')
    revalidatePath('/fiscal/tarefas')
  }
```

with:

```ts
  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    if (!(await podeEditarCliente(id))) return
    const { user, supabase } = await getAuthenticatedAdmin()
    if (!supabase) return
    const concluida_em = concluida
      ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
      : null
    const { data: existing } = await supabase
      .from('tarefas').select('id, parcelamento_id')
      .eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('tarefas')
        .update({ concluida, concluida_em })
        .eq('id', existing.id)
    } else {
      await supabase.from('tarefas')
        .insert({ cliente_id: id, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida, concluida_em })
    }
    if (existing?.parcelamento_id) {
      await gravarDataParcelamento(supabase, existing.parcelamento_id, mes, concluida && data ? isoParaDdMm(data) : null)
    }
    revalidatePath(`/fiscal/clientes/${id}`)
    revalidatePath('/fiscal/clientes')
    revalidatePath('/fiscal/dashboard')
    revalidatePath('/fiscal/relatorios')
    revalidatePath('/fiscal/tarefas')
  }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx"
git commit -m "feat: sincroniza e grava tarefas de parcelamento na ficha fiscal"
```

---

### Task 6: Fiscal — limpar a data do parcelamento ao desbloquear a tarefa

Fiscal's checklist never calls `toggleTarefa(tipo, false)` directly — clearing a completed task goes through the separate "Desbloquear" flow (`desbloquearTarefa`, in `actions.ts`, requires a `motivo`). That's the code path that must clear the `parcelamentos` column back to `null` (spec item 5, "Desmarcar a tarefa limpa esse mesmo campo").

**Files:**
- Modify: `app/fiscal/clientes/actions.ts`

**Interfaces:**
- Consumes: `gravarDataParcelamento` (Task 3).

- [ ] **Step 1: Add the import**

At the top of `app/fiscal/clientes/actions.ts`, alongside the existing imports (near line 6):

```ts
import { gravarDataParcelamento } from '@/lib/parcelamento-tarefas'
```

- [ ] **Step 2: Clear the parcelamento column on unlock**

Replace `desbloquearTarefa` (lines 8-43):

```ts
export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id').eq('id', tarefaId).single()
  if (!tarefa || !(await podeEditarCliente(tarefa.cliente_id))) return

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
    .eq('id', tarefaId)

  await supabase.from('task_unlock_log').insert({
    usuario_id: user?.id,
    usuario_nome: usuarioNome,
    cliente_id: null,
    cliente_nome: clienteNome,
    tarefa: tarefaTipo,
    competencia,
    valor_antigo: 'concluida',
    valor_novo: 'pendente',
    motivo,
  })

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}
```

with:

```ts
export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id, mes, parcelamento_id').eq('id', tarefaId).single()
  if (!tarefa || !(await podeEditarCliente(tarefa.cliente_id))) return

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
    .eq('id', tarefaId)

  if (tarefa.parcelamento_id) {
    await gravarDataParcelamento(supabase, tarefa.parcelamento_id, tarefa.mes, null)
  }

  await supabase.from('task_unlock_log').insert({
    usuario_id: user?.id,
    usuario_nome: usuarioNome,
    cliente_id: null,
    cliente_nome: clienteNome,
    tarefa: tarefaTipo,
    competencia,
    valor_antigo: 'concluida',
    valor_novo: 'pendente',
    motivo,
  })

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/clientes/actions.ts
git commit -m "feat: limpa data do parcelamento ao desbloquear tarefa vinculada"
```

---

### Task 7: Pessoal ficha do cliente — sincronização + merge

Pessoal's `TarefaChecklistPessoal` has no fallback-by-group logic (unlike Fiscal) — it always renders exactly the `tarefasPersonalizadas` array it's given, filtered only by month visibility. So merging here is a plain concat, no fallback reproduction needed.

**Files:**
- Modify: `app/pessoal/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `sincronizarTarefasParcelamento` (Task 3).

- [ ] **Step 1: Add the import**

At the top of `app/pessoal/clientes/[id]/page.tsx`, alongside the existing imports (near line 7):

```ts
import { sincronizarTarefasParcelamento } from '@/lib/parcelamento-tarefas'
```

- [ ] **Step 2: Call the sync before the `Promise.all` that fetches tarefas**

Insert right after `const { mes, ano } = await getMesAno()` (line 37), before `const hoje = ...` (line 38):

```ts
  const { mes, ano } = await getMesAno()
  await sincronizarTarefasParcelamento(supabase, 'pessoal', mes, ano)
```

- [ ] **Step 3: Compute the merged task list after `tarefas` is fetched**

Insert after the `Promise.all` block that fetches `tarefas` (after line 45), before the `eventosCalRaw` query:

```ts
  const tiposDeParcelamento = Array.from(new Set(
    (tarefas ?? []).filter(t => t.parcelamento_id).map(t => t.tipo)
  ))
  const tarefasPersonalizadasEfetivas = [...cliente.tarefas_personalizadas, ...tiposDeParcelamento]
```

- [ ] **Step 4: Pass the merged list to `TarefaChecklistPessoal`**

Replace (in the `<TarefaChecklistPessoal ... />` block, around line 143):

```tsx
        tarefasPersonalizadas={cliente.tarefas_personalizadas}
```

with:

```tsx
        tarefasPersonalizadas={tarefasPersonalizadasEfetivas}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "app/pessoal/clientes/[id]/page.tsx"
git commit -m "feat: sincroniza tarefas de parcelamento na ficha pessoal"
```

---

### Task 8: Pessoal — gravar/limpar a data do parcelamento no toggle

Unlike Fiscal, Pessoal's `toggleTarefaPessoal` is called directly for both completing (`concluida=true`) and clearing (`concluida=false`) — there's no separate unlock flow. One function handles both write and clear.

**Files:**
- Modify: `app/pessoal/clientes/actions.ts`

**Interfaces:**
- Consumes: `gravarDataParcelamento`, `isoParaDdMm` (Task 2, Task 3).

- [ ] **Step 1: Add the import**

At the top of `app/pessoal/clientes/actions.ts`, alongside the existing imports (near line 6):

```ts
import { gravarDataParcelamento, isoParaDdMm } from '@/lib/parcelamento-tarefas'
```

- [ ] **Step 2: Write/clear the parcelamento column in `toggleTarefaPessoal`**

Replace `toggleTarefaPessoal` (lines 8-37):

```ts
export async function toggleTarefaPessoal(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida, concluida_em })
  }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
}
```

with:

```ts
export async function toggleTarefaPessoal(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClientePessoal(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id, parcelamento_id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'pessoal')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'pessoal', concluida, concluida_em })
  }

  if (existing?.parcelamento_id) {
    await gravarDataParcelamento(supabase, existing.parcelamento_id, mes, concluida && data ? isoParaDdMm(data) : null)
  }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/pessoal/clientes/actions.ts
git commit -m "feat: grava e limpa data do parcelamento no toggle da tarefa pessoal"
```

---

### Task 9: Dashboards Fiscal + Pessoal — sincronização e contagem correta de %

Both dashboards compute their "Progresso Geral" percentage from a `tiposMap` built purely from each client's static `tarefas_personalizadas`. Extending that map with the dynamically-named parcelamento tasks (already present in `ts`, the tarefas already fetched for the month) is enough to make parcelamento tasks count correctly — no separate parcelamento query needed here, since the sync call guarantees the rows exist in `tarefas` before `ts` is read.

**Files:**
- Modify: `app/fiscal/dashboard/page.tsx`
- Modify: `app/pessoal/dashboard/page.tsx`

**Interfaces:**
- Consumes: `sincronizarTarefasParcelamento` (Task 3).

- [ ] **Step 1: Fiscal dashboard — add import and sync call**

At the top of `app/fiscal/dashboard/page.tsx`, alongside the existing imports (near line 8):

```ts
import { sincronizarTarefasParcelamento } from '@/lib/parcelamento-tarefas'
```

Replace (lines 16-28):

```ts
  const { mes, ano } = await getMesAno()
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano),
    supabase.from('calendario_eventos').select('*').eq('setor', 'fiscal'),
  ])
```

with:

```ts
  const { mes, ano } = await getMesAno()
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  await sincronizarTarefasParcelamento(supabase, 'fiscal', mes, ano)

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano),
    supabase.from('calendario_eventos').select('*').eq('setor', 'fiscal'),
  ])
```

- [ ] **Step 2: Fiscal dashboard — extend `tiposMap` with parcelamento-derived task names**

Replace (lines 35-43):

```ts
  // Mapa de tipos válidos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0
```

with:

```ts
  // Mapa de tipos válidos por cliente — inclui as tarefas geradas por
  // parcelamento (nome dinâmico, não cadastrado em tarefas_personalizadas).
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }
  for (const t of ts) {
    if (t.parcelamento_id) tiposMap[t.cliente_id]?.add(t.tipo)
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0
```

- [ ] **Step 3: Pessoal dashboard — add import and sync call**

At the top of `app/pessoal/dashboard/page.tsx`, alongside the existing imports (near line 8):

```ts
import { sincronizarTarefasParcelamento } from '@/lib/parcelamento-tarefas'
```

Replace (lines 18-30):

```ts
  const { mes, ano } = await getMesAno()
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('clientes_pessoal.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'pessoal'),
    supabase.from('calendario_eventos').select('*').eq('setor', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal'),
  ])
```

with:

```ts
  const { mes, ano } = await getMesAno()
  const ehMesAtual = (() => {
    const real = getMesAnoRealAgora()
    return mes === real.mes && ano === real.ano
  })()

  await sincronizarTarefasParcelamento(supabase, 'pessoal', mes, ano)

  const [{ data: clientesRaw }, { data: profiles }, tarefas, { data: eventosRaw }, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('clientes_pessoal.ativo', true).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano, '*', 'pessoal'),
    supabase.from('calendario_eventos').select('*').eq('setor', 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, meses_visiveis').eq('setor', 'pessoal'),
  ])
```

- [ ] **Step 4: Pessoal dashboard — extend `tiposMap` with parcelamento-derived task names**

Replace (lines 40-47):

```ts
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTarefasVisiveis(c.tarefas_personalizadas ?? [], mesesVisiveisPorTipo, mes))
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0
```

with:

```ts
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTarefasVisiveis(c.tarefas_personalizadas ?? [], mesesVisiveisPorTipo, mes))
  }
  for (const t of ts) {
    if (t.parcelamento_id) tiposMap[t.cliente_id]?.add(t.tipo)
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/dashboard/page.tsx app/pessoal/dashboard/page.tsx
git commit -m "feat: dashboards fiscal e pessoal sincronizam e contam tarefas de parcelamento"
```

---

### Task 10: Tela de Parcelamentos — checkboxes de setor + meses somente leitura

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

- [ ] **Step 1: Add `setores` to the `Parcelamento` interface and `EMPTY_FORM`**

Replace (lines 20-42):

```ts
interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  status: StatusParcelamento
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}

const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

with:

```ts
interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  status: StatusParcelamento
  setores: string[]
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}

const SETORES_PARCELAMENTO: { valor: string; label: string }[] = [
  { valor: 'fiscal', label: 'Fiscal' },
  { valor: 'contabil', label: 'Contábil' },
  { valor: 'pessoal', label: 'Pessoal' },
]

const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', setores: [], tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

- [ ] **Step 2: Add the toggle function**

Insert right after `setF` (after line 164):

```ts
  function toggleSetorParcelamento(setor: string) {
    setForm(prev => ({
      ...prev,
      setores: prev.setores.includes(setor) ? prev.setores.filter(s => s !== setor) : [...prev.setores, setor],
    }))
  }
```

- [ ] **Step 3: Add the checkbox UI, between the Regime/Responsável/Local-Tipo/Status grid and the Tarefa field**

Insert after the closing `</div>` of the 4-field grid (after line 609), before the "Tarefa" field block:

```tsx
              {/* Setores que geram tarefa automática */}
              <div>
                <label className={labelCls}>Gera tarefa automática nos setores</label>
                <div className="grid grid-cols-3 gap-2">
                  {SETORES_PARCELAMENTO.map(s => (
                    <label key={s.valor} className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10">
                      <input
                        type="checkbox"
                        checked={form.setores.includes(s.valor)}
                        onChange={() => toggleSetorParcelamento(s.valor)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]"
                      />
                      <span className="text-[var(--fg)]/70 text-xs">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
```

- [ ] **Step 4: Make the month fields read-only**

Replace (lines 617-632):

```tsx
              {/* Meses */}
              <div>
                <label className={labelCls}>Parcelas Mensais — data de emissão/envio (dd/mm)</label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => (
                    <div key={mes}>
                      <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                      <input
                        value={(form as any)[mes] ?? ''}
                        onChange={e => setF(mes as any, e.target.value || null)}
                        placeholder="dd/mm"
                        className="w-full px-2 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs text-center focus:outline-none focus:border-[var(--accent)]/50" />
                    </div>
                  ))}
                </div>
              </div>
```

with:

```tsx
              {/* Meses — somente leitura: preenchidos pela tarefa na ficha do cliente */}
              <div>
                <label className={labelCls}>Parcelas Mensais — data de emissão/envio (preenchido pela tarefa na ficha do cliente)</label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => {
                    const valor = (form as any)[mes] as string | null
                    return (
                      <div key={mes}>
                        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                        <div className={`w-full px-2 py-2 rounded-xl border text-xs text-center ${
                          valor ? 'bg-blue-500/10 border-transparent text-[var(--fg)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/20'
                        }`}>
                          {valor ?? '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: setores do parcelamento no cadastro, meses viram somente leitura"
```

---

### Task 11: Manual end-to-end verification (dev Supabase, browser)

No automated test exercises the full reactive-sync flow across pages (it needs a running Next.js server + real Supabase state). Verify manually before considering the feature done.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server against the dev Supabase project and log in**

Use the `run` skill or `npm run dev`; log in with one of the dev test users (see memory `reference_dev_test_users`).

- [ ] **Step 2: Create a test parcelamento with setor Fiscal**

Go to `/fiscal/parcelamentos`, create a parcelamento for a real dev client, status "EM ANDAMENTO", check the "Fiscal" setor checkbox, leave all 12 month fields empty, save. Confirm the month fields render as read-only dashes.

- [ ] **Step 3: Open that client's Fiscal ficha for the current month and verify the task appears**

Navigate to `/fiscal/clientes/[id]`. Confirm a new checklist entry named `Parcelamentos (<seção>)` appears, pending, and that the top progress count (`X/Y`) includes it in `Y`.

- [ ] **Step 4: Fill the date and verify write-back**

Type a date into that task's date field. Confirm it saves (checklist marks it done). Then go back to `/fiscal/parcelamentos`, open the same parcelamento, and confirm the corresponding month column now shows the same `dd/mm` value.

- [ ] **Step 5: Unlock and verify the value clears**

On the ficha, click "Desbloquear" on that task, provide a motivo, confirm. Verify the task goes back to pending, and back on `/fiscal/parcelamentos` the month column is empty again.

- [ ] **Step 6: Verify the Fiscal dashboard percentage**

Go to `/fiscal/dashboard` and confirm "Progresso Geral" reflects the parcelamento task's current state (pending after step 5).

- [ ] **Step 7: Repeat steps 2-6 for setor Pessoal**

Same flow via `/pessoal/clientes/[id]` and `/pessoal/dashboard` (Pessoal's toggle clears directly on blur, no separate "Desbloquear" step — clearing the date field is enough).

- [ ] **Step 8: Verify disambiguation with two parcelamentos in the same seção**

Create a second parcelamento for the same client, same seção, setor Fiscal, with a distinct "Local / Tipo" value. Reload the ficha and confirm two separate tasks appear, named `Parcelamentos (<seção> / <local/tipo>)` for both (or at least distinctly for the second one, since disambiguation only kicks in when the group has 2+ items — confirm the first one's name also gained the ` / <local/tipo>` suffix once the second was added).

- [ ] **Step 9: Report findings**

If any step fails, note the exact page/action and stop — do not mark the plan complete. If all pass, the feature is ready to hand off for code review (`superpowers:requesting-code-review`).
