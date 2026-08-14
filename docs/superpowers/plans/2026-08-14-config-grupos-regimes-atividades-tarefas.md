# Configuração de Grupos, Regimes, Atividades e Tarefas — Plano A (Base: entidades + admin + vínculos)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar as entidades administráveis Regime/Grupo/Atividade (por setor: fiscal, contábil, pessoal), o catálogo de vínculos entre elas e `tarefa_tipos`, e a tela `/admin/configuracoes` onde o usuário cadastra tudo isso — sem ainda migrar os clientes existentes nem mudar como as tarefas são geradas hoje.

**Architecture:** Três tabelas Postgres novas (`regimes`, `grupos`, `atividades`) espelhando o padrão já usado por `tarefa_tipos` (RLS: leitura para autenticado, escrita para `is_admin()`), mais uma tabela de junção `tarefa_tipo_vinculos`. Camada de lib com funções puras testáveis (validação/normalização) e Server Actions finas por cima (padrão idêntico a `app/fiscal/parametros/actions.ts`: `exigirSessaoAdmin()` + checagem de `role==='admin'`). UI nova em `/admin/configuracoes`, protegida como rota ADMIN (step-up), com componentes genéricos reaproveitados entre Grupos/Regimes/Atividades.

**Tech Stack:** Next.js (App Router, Server Actions), Supabase/Postgres, TypeScript, `node:test` para testes de funções puras.

## Global Constraints

- Este plano **não** mexe em `clientes_fiscal`/`clientes_contabil`/`clientes_pessoal`, não migra dados de cliente existentes, e não altera como `tarefas_personalizadas` é lido hoje. Isso é o Plano B (spec seção "Migração dos dados existentes" e "Geração automática de tarefas"), que depende deste plano estar concluído.
- Setores cobertos: `fiscal`, `contabil`, `pessoal` (não `societario`/`financeiro` — sem tabela de cliente própria ainda, conforme spec).
- Toda tabela nova segue o padrão RLS de `tarefa_tipos` (`007_schema_contabil.sql:48-51`): select livre para autenticado, todo o resto só para `is_admin()`.
- Toda Server Action de escrita segue o padrão de `app/fiscal/parametros/actions.ts`: chama `exigirSessaoAdmin()` (sessão ADMIN step-up) e confere `profiles.role === 'admin'` antes de qualquer escrita.
- Rota nova entra em `lib/rotas-admin.ts` (`ROTAS_ADMIN`), senão o step-up de sessão ADMIN não protege a página.
- Sem framework de teste com mocks de Supabase — só `node:test` puro contra funções extraídas sem I/O (padrão de `tests/vinculos.test.ts`). Server Actions não ganham teste automatizado; ganham passo de verificação manual via `preview_start`.

---

### Task 1: Migration — tabelas `regimes`, `grupos`, `atividades`

**Files:**
- Create: `supabase/migrations/024_config_regimes_grupos_atividades.sql`

**Interfaces:**
- Produces: tabelas `regimes(id, setor, nome, ativo)`, `grupos(id, setor, nome, ativo)`, `atividades(id, setor, nome, ativo)`, todas com `unique(setor, nome)`. Consumidas pelas Server Actions da Task 4.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/024_config_regimes_grupos_atividades.sql

-- Entidades administráveis de Regime, Grupo e Atividade, uma por setor
-- (fiscal/contábil/pessoal). Base estrutural do projeto de padronização de
-- tarefas — ver docs/superpowers/specs/2026-08-14-config-grupos-regimes-
-- atividades-tarefas-design.md. Mesmo padrão de RLS de tarefa_tipos
-- (007_schema_contabil.sql): select livre pra autenticado, resto só admin.

create table regimes (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);

create table grupos (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);

create table atividades (
  id     uuid primary key default gen_random_uuid(),
  setor  user_setor not null,
  nome   text not null,
  ativo  boolean not null default true,
  unique (setor, nome)
);

alter table regimes    enable row level security;
alter table grupos     enable row level security;
alter table atividades enable row level security;

create policy "Autenticados leem regimes" on regimes for select using (auth.uid() is not null);
create policy "Admin gerencia regimes" on regimes for all using (is_admin());

create policy "Autenticados leem grupos" on grupos for select using (auth.uid() is not null);
create policy "Admin gerencia grupos" on grupos for all using (is_admin());

create policy "Autenticados leem atividades" on atividades for select using (auth.uid() is not null);
create policy "Admin gerencia atividades" on atividades for all using (is_admin());
```

- [ ] **Step 2: Aplicar no banco de dev**

Rodar a migration contra o Supabase de dev (mesmo processo já usado nas migrations anteriores do projeto — via SQL editor do painel Supabase ou script de migration existente, conforme `scripts/migrate.ts` do repo).

- [ ] **Step 3: Verificar**

No SQL editor do Supabase de dev, rodar:
```sql
insert into regimes (setor, nome) values ('fiscal', 'Normal') returning *;
insert into grupos (setor, nome) values ('fiscal', 'Lucro Presumido') returning *;
insert into atividades (setor, nome) values ('fiscal', 'Comércio') returning *;
select * from regimes; select * from grupos; select * from atividades;
```
Esperado: os 3 inserts retornam a linha criada; um segundo insert com o mesmo `(setor, nome)` falha com violação de `unique`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/024_config_regimes_grupos_atividades.sql
git commit -m "feat: tabelas regimes, grupos e atividades (config por setor)"
```

---

### Task 2: Migration — tabela `tarefa_tipo_vinculos`

**Files:**
- Create: `supabase/migrations/025_tarefa_tipo_vinculos.sql`

**Interfaces:**
- Consumes: `tarefa_tipos.id` (existente), `regimes.id`/`grupos.id`/`atividades.id` (Task 1).
- Produces: tabela `tarefa_tipo_vinculos(id, tarefa_tipo_id, entidade_tipo, entidade_id)`. Consumida por `lib/tarefa-tipo-vinculos-actions.ts` (Task 5).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/025_tarefa_tipo_vinculos.sql

-- Vínculo entre um tipo de tarefa do catálogo (tarefa_tipos) e uma entidade
-- de Regime, Grupo ou Atividade. entidade_id referencia regimes.id/
-- grupos.id/atividades.id conforme entidade_tipo — sem FK direta pra cada
-- uma (não dá pra ter 3 FKs opcionais limpas em Postgres pra uma coluna só);
-- a integridade é garantida na aplicação (lib/tarefa-tipo-vinculos-
-- actions.ts), mesmo padrão de tarefa_tipos.setor sendo comparado a
-- user_setor sem FK formal.
create table tarefa_tipo_vinculos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_tipo_id uuid not null references tarefa_tipos(id) on delete cascade,
  entidade_tipo  text not null check (entidade_tipo in ('regime', 'grupo', 'atividade')),
  entidade_id    uuid not null,
  unique (tarefa_tipo_id, entidade_tipo, entidade_id)
);

create index idx_tarefa_tipo_vinculos_entidade on tarefa_tipo_vinculos (entidade_tipo, entidade_id);

alter table tarefa_tipo_vinculos enable row level security;

create policy "Autenticados leem tarefa_tipo_vinculos" on tarefa_tipo_vinculos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_tipo_vinculos" on tarefa_tipo_vinculos for all using (is_admin());
```

- [ ] **Step 2: Aplicar no banco de dev**

Mesmo processo da Task 1, Step 2.

- [ ] **Step 3: Verificar**

```sql
-- usar o id de tarefa_tipos e o id de regimes criados na Task 1
select id from tarefa_tipos where setor = 'fiscal' limit 1;
select id from regimes where setor = 'fiscal' and nome = 'Normal';

insert into tarefa_tipo_vinculos (tarefa_tipo_id, entidade_tipo, entidade_id)
values ('<id-tarefa-tipo>', 'regime', '<id-regime>') returning *;
```
Esperado: insert com sucesso; repetir o mesmo insert falha por `unique`; inserir com `entidade_tipo = 'invalido'` falha pelo `check`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/025_tarefa_tipo_vinculos.sql
git commit -m "feat: tabela tarefa_tipo_vinculos"
```

---

### Task 3: `lib/config-entidades.ts` — funções puras (validação/normalização) + testes

**Files:**
- Create: `lib/config-entidades.ts`
- Create: `tests/config-entidades.test.ts`
- Modify: `app/fiscal/parametros/actions.ts:8-10` (remove `normalizarNome` local, importar do novo lib)

**Interfaces:**
- Produces: `normalizarNome(s: string): string`, `validarNomeEntidade(nome: string): string | null`, `ordenarPorNome<T extends { nome: string }>(itens: T[]): T[]`. Consumidas pelas Server Actions da Task 4/5 e pela UI.

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// tests/config-entidades.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarNome, validarNomeEntidade, ordenarPorNome } from '../lib/config-entidades'

test('normalizarNome: remove acentos e caixa', () => {
  assert.equal(normalizarNome('  Lucro Presumido  '), 'LUCRO PRESUMIDO')
  assert.equal(normalizarNome('Isenção'), 'ISENCAO')
})

test('normalizarNome: strings já normalizadas ficam iguais só em maiúscula', () => {
  assert.equal(normalizarNome('MEI'), 'MEI')
})

test('validarNomeEntidade: rejeita nome vazio', () => {
  assert.equal(validarNomeEntidade(''), 'O nome não pode ficar vazio.')
  assert.equal(validarNomeEntidade('   '), 'O nome não pode ficar vazio.')
})

test('validarNomeEntidade: rejeita nome maior que 100 caracteres', () => {
  const longo = 'A'.repeat(101)
  assert.equal(validarNomeEntidade(longo), 'O nome não pode passar de 100 caracteres.')
})

test('validarNomeEntidade: aceita nome válido', () => {
  assert.equal(validarNomeEntidade('MEI Caminhoneiro'), null)
})

test('ordenarPorNome: ordena alfabeticamente em pt-BR (acentos não quebram a ordem)', () => {
  const itens = [{ nome: 'Simples' }, { nome: 'Água' }, { nome: 'MEI' }]
  assert.deepEqual(ordenarPorNome(itens).map(i => i.nome), ['Água', 'MEI', 'Simples'])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/config-entidades'`

- [ ] **Step 3: Implementar**

```ts
// lib/config-entidades.ts

// Compartilhada com o aviso de drift de /fiscal/parametros (que comparava
// nomes de template contra o catálogo tarefa_tipos) — extraída aqui pra
// ser reusada também na migração de dados de cliente (Plano B) e na
// validação de vínculos desta tela.
export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export function validarNomeEntidade(nome: string): string | null {
  const trimmed = nome.trim()
  if (trimmed.length === 0) return 'O nome não pode ficar vazio.'
  if (trimmed.length > 100) return 'O nome não pode passar de 100 caracteres.'
  return null
}

export function ordenarPorNome<T extends { nome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos os testes de `config-entidades.test.ts`)

- [ ] **Step 5: Remover a duplicata em `app/fiscal/parametros/actions.ts`**

Trocar (linhas 8-10):
```ts
function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}
```
por:
```ts
import { normalizarNome } from '@/lib/config-entidades'
```
(adicionar ao bloco de imports do topo do arquivo, junto aos já existentes).

- [ ] **Step 6: Rodar os testes de novo pra garantir que nada quebrou**

Run: `npm test`
Expected: PASS (inclusive `tests/` existentes que não mudaram)

- [ ] **Step 7: Commit**

```bash
git add lib/config-entidades.ts tests/config-entidades.test.ts app/fiscal/parametros/actions.ts
git commit -m "feat: extrai normalizarNome/validarNomeEntidade/ordenarPorNome pra lib compartilhada"
```

---

### Task 4: `lib/config-entidades-actions.ts` — CRUD de Regimes/Grupos/Atividades

**Files:**
- Create: `lib/config-entidades-actions.ts`

**Interfaces:**
- Consumes: `validarNomeEntidade` (Task 3), `getAuthenticatedAdmin`/`createClient` (`lib/supabase/server.ts`, existente), `getValidAdminSession` (`lib/admin-auth/server.ts`, existente), `UserSetor` (`lib/types.ts`, existente).
- Produces: `TipoEntidade = 'regimes' | 'grupos' | 'atividades'`, `EntidadeConfig { id, setor, nome, ativo }`, `listarEntidades(tabela, setor)`, `criarEntidade(tabela, setor, nome)`, `renomearEntidade(tabela, id, nome)`, `alternarAtivoEntidade(tabela, id, ativo)`. Consumidas por `EntidadeListaTab.tsx` (Task 8).

- [ ] **Step 1: Implementar**

```ts
// lib/config-entidades-actions.ts
'use server'

import { getAuthenticatedAdmin, createClient } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor } from '@/lib/types'
import { validarNomeEntidade } from '@/lib/config-entidades'

export type TipoEntidade = 'regimes' | 'grupos' | 'atividades'

export interface EntidadeConfig {
  id: string
  setor: UserSetor
  nome: string
  ativo: boolean
}

const ERRO_SESSAO_ADMIN = 'Sessão ADMIN expirada. Faça login novamente.'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const session = await getValidAdminSession()
  if (!session) return { error: ERRO_SESSAO_ADMIN, supabase: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarEntidades(
  tabela: TipoEntidade,
  setor: UserSetor,
): Promise<{ data: EntidadeConfig[]; error: string | null }> {
  // Leitura não exige a sessão ADMIN step-up (RLS já libera pra qualquer
  // autenticado) — mas a tela em si vive atrás de requireAdminSection, então
  // manter a mesma checagem aqui simplifica (uma função só, sem dois caminhos).
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from(tabela)
    .select('id, setor, nome, ativo')
    .eq('setor', setor)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as EntidadeConfig[], error: null }
}

export async function criarEntidade(
  tabela: TipoEntidade,
  setor: UserSetor,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: insertError } = await supabase.from(tabela).insert({ setor, nome: nome.trim() })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'Já existe um item com esse nome nesse setor.' }
    return { error: insertError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function renomearEntidade(
  tabela: TipoEntidade,
  id: string,
  nome: string,
): Promise<{ error: string | null }> {
  const erroNome = validarNomeEntidade(nome)
  if (erroNome) return { error: erroNome }

  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from(tabela).update({ nome: nome.trim() }).eq('id', id)
  if (updateError) {
    if (updateError.code === '23505') return { error: 'Já existe um item com esse nome nesse setor.' }
    return { error: updateError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function alternarAtivoEntidade(
  tabela: TipoEntidade,
  id: string,
  ativo: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from(tabela).update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
```

Nota: `createClient` é importado mas não usado diretamente neste arquivo (só `getAuthenticatedAdmin`) — remover do import se o TypeScript acusar `unused import` ao rodar o build (Step 3).

- [ ] **Step 2: Ajustar o import (remover `createClient` não usado)**

```ts
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
```

- [ ] **Step 3: Rodar o build/typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `lib/config-entidades-actions.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/config-entidades-actions.ts
git commit -m "feat: server actions de CRUD para regimes/grupos/atividades"
```

---

### Task 5: `lib/tarefa-tipo-vinculos-actions.ts` — catálogo de tarefas + vínculos

**Files:**
- Create: `lib/tarefa-tipo-vinculos-actions.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAdmin`, `getValidAdminSession`, `UserSetor` (existentes).
- Produces: `TipoEntidadeVinculo = 'regime' | 'grupo' | 'atividade'`, `TarefaTipoResumo { id, nome, ativo }`, `listarTarefaTiposDoSetor(setor)`, `alternarAtivoTarefaTipo(id, ativo)`, `listarTarefaTipoIdsVinculados(entidadeTipo, entidadeId)`, `alternarVinculo(tarefaTipoId, entidadeTipo, entidadeId, vincular)`. Consumidas por `TarefasTab.tsx` (Task 10) e `VincularTarefasModal.tsx` (Task 9).

- [ ] **Step 1: Implementar**

```ts
// lib/tarefa-tipo-vinculos-actions.ts
'use server'

import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getValidAdminSession } from '@/lib/admin-auth/server'
import { revalidatePath } from 'next/cache'
import type { UserSetor } from '@/lib/types'

export type TipoEntidadeVinculo = 'regime' | 'grupo' | 'atividade'

export interface TarefaTipoResumo {
  id: string
  nome: string
  ativo: boolean
}

const ERRO_SESSAO_ADMIN = 'Sessão ADMIN expirada. Faça login novamente.'

type SupabaseAdmin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>

async function exigirAdmin(): Promise<{ error: string | null; supabase: SupabaseAdmin | null }> {
  const session = await getValidAdminSession()
  if (!session) return { error: ERRO_SESSAO_ADMIN, supabase: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', supabase: null }

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', supabase: null }

  return { error: null, supabase }
}

export async function listarTarefaTiposDoSetor(
  setor: UserSetor,
): Promise<{ data: TarefaTipoResumo[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipos')
    .select('id, nome, ativo')
    .eq('setor', setor)
    .order('nome')

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []) as TarefaTipoResumo[], error: null }
}

export async function alternarAtivoTarefaTipo(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  const { error: updateError } = await supabase.from('tarefa_tipos').update({ ativo }).eq('id', id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}

export async function listarTarefaTipoIdsVinculados(
  entidadeTipo: TipoEntidadeVinculo,
  entidadeId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: queryError } = await supabase
    .from('tarefa_tipo_vinculos')
    .select('tarefa_tipo_id')
    .eq('entidade_tipo', entidadeTipo)
    .eq('entidade_id', entidadeId)

  if (queryError) return { data: [], error: queryError.message }
  return { data: (data ?? []).map(row => row.tarefa_tipo_id as string), error: null }
}

export async function alternarVinculo(
  tarefaTipoId: string,
  entidadeTipo: TipoEntidadeVinculo,
  entidadeId: string,
  vincular: boolean,
): Promise<{ error: string | null }> {
  const { error, supabase } = await exigirAdmin()
  if (error || !supabase) return { error }

  if (vincular) {
    const { error: insertError } = await supabase
      .from('tarefa_tipo_vinculos')
      .insert({ tarefa_tipo_id: tarefaTipoId, entidade_tipo: entidadeTipo, entidade_id: entidadeId })
    if (insertError && insertError.code !== '23505') return { error: insertError.message }
  } else {
    const { error: deleteError } = await supabase
      .from('tarefa_tipo_vinculos')
      .delete()
      .eq('tarefa_tipo_id', tarefaTipoId)
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
    if (deleteError) return { error: deleteError.message }
  }

  revalidatePath('/admin/configuracoes')
  return { error: null }
}
```

- [ ] **Step 2: Rodar o build/typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `lib/tarefa-tipo-vinculos-actions.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/tarefa-tipo-vinculos-actions.ts
git commit -m "feat: server actions de catálogo de tarefas e vínculos com entidades"
```

---

### Task 6: Registrar a rota ADMIN e criar `app/admin/configuracoes/page.tsx`

**Files:**
- Modify: `lib/rotas-admin.ts:8`
- Create: `app/admin/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `requireAdminSection` (`lib/admin-auth/server.ts`), `createClient` (`lib/supabase/server.ts`), `SairAdminButton` (`components/admin/SairAdminButton.tsx`, existentes) — todos já usados no mesmo formato em `app/fiscal/parametros/page.tsx`.
- Produces: rota `/admin/configuracoes` renderizando `ConfiguracoesClient` (Task 7). Sem props iniciais do servidor — o client component busca os dados via Server Actions ao montar (setor inicial fixo em `'fiscal'`).

- [ ] **Step 1: Adicionar a rota à allowlist ADMIN**

Em `lib/rotas-admin.ts:8`, trocar:
```ts
export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos'] as const
```
por:
```ts
export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos', '/admin/configuracoes'] as const
```

- [ ] **Step 2: Criar a página**

```tsx
// app/admin/configuracoes/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSection } from '@/lib/admin-auth/server'
import SairAdminButton from '@/components/admin/SairAdminButton'
import ConfiguracoesClient from './ConfiguracoesClient'

export const metadata = { title: 'Configurações — Tesserato' }

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  // Guarda autoritativa da seção ADMIN — mesmo padrão de
  // app/fiscal/parametros/page.tsx.
  await requireAdminSection('/admin/configuracoes')

  return (
    <>
      <SairAdminButton />
      <ConfiguracoesClient />
    </>
  )
}
```

- [ ] **Step 3: Commit**

(Combinar com a Task 7 num commit só, já que `ConfiguracoesClient` ainda não existe e o build quebraria isolado — ver Step de commit da Task 7.)

---

### Task 7: `ConfiguracoesClient.tsx` — shell com seletor de setor e categoria

**Files:**
- Create: `app/admin/configuracoes/ConfiguracoesClient.tsx`

**Interfaces:**
- Consumes: `UserSetor` (`lib/types.ts`), `EntidadeListaTab` (Task 8), `TarefasTab` (Task 10).
- Produces: componente `ConfiguracoesClient` (default export, sem props) renderizado por `page.tsx` (Task 6).

- [ ] **Step 1: Implementar**

```tsx
// app/admin/configuracoes/ConfiguracoesClient.tsx
'use client'

import { useState } from 'react'
import type { UserSetor } from '@/lib/types'
import EntidadeListaTab from './EntidadeListaTab'
import TarefasTab from './TarefasTab'

const SETORES: { value: UserSetor; label: string }[] = [
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'contabil', label: 'Contábil' },
  { value: 'pessoal', label: 'Pessoal' },
]

type Categoria = 'grupos' | 'regimes' | 'atividades' | 'tarefas'

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'grupos', label: 'Grupos' },
  { value: 'regimes', label: 'Regimes' },
  { value: 'atividades', label: 'Atividades' },
  { value: 'tarefas', label: 'Tarefas' },
]

const botaoCls = (ativo: boolean) =>
  `px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
    ativo
      ? 'bg-[var(--accent)] text-[var(--fg)]'
      : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
  }`

export default function ConfiguracoesClient() {
  const [setor, setSetor] = useState<UserSetor>('fiscal')
  const [categoria, setCategoria] = useState<Categoria>('grupos')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">
        Grupos, Regimes, Atividades e Tarefas por setor.
      </p>

      <div className="flex gap-2 mb-4">
        {SETORES.map(s => (
          <button key={s.value} onClick={() => setSetor(s.value)} className={botaoCls(setor === s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-8 border-b border-[var(--fg)]/8 pb-4">
        {CATEGORIAS.map(c => (
          <button key={c.value} onClick={() => setCategoria(c.value)} className={botaoCls(categoria === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {categoria === 'grupos' && <EntidadeListaTab tabela="grupos" entidadeTipoVinculo="grupo" setor={setor} label="Grupo" />}
      {categoria === 'regimes' && <EntidadeListaTab tabela="regimes" entidadeTipoVinculo="regime" setor={setor} label="Regime" />}
      {categoria === 'atividades' && <EntidadeListaTab tabela="atividades" entidadeTipoVinculo="atividade" setor={setor} label="Atividade" />}
      {categoria === 'tarefas' && <TarefasTab setor={setor} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

(Junto com Task 6 — os dois arquivos formam a rota; commitar depois que `EntidadeListaTab`/`TarefasTab` existirem, Tasks 8-10, pra não quebrar o build no meio do caminho. Ver commit final na Task 10.)

---

### Task 8: `EntidadeListaTab.tsx` — CRUD genérico reusado por Grupos/Regimes/Atividades

**Files:**
- Create: `app/admin/configuracoes/EntidadeListaTab.tsx`

**Interfaces:**
- Consumes: `listarEntidades`, `criarEntidade`, `renomearEntidade`, `alternarAtivoEntidade`, `type TipoEntidade`, `type EntidadeConfig` (`lib/config-entidades-actions.ts`, Task 4); `ordenarPorNome` (`lib/config-entidades.ts`, Task 3); `type TipoEntidadeVinculo` (`lib/tarefa-tipo-vinculos-actions.ts`, Task 5); `VincularTarefasModal` (Task 9); `UserSetor` (`lib/types.ts`).
- Produces: componente `EntidadeListaTab` (default export), props `{ tabela: TipoEntidade; entidadeTipoVinculo: TipoEntidadeVinculo; setor: UserSetor; label: string }`. Usado por `ConfiguracoesClient` (Task 7).

- [ ] **Step 1: Implementar**

```tsx
// app/admin/configuracoes/EntidadeListaTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import type { UserSetor } from '@/lib/types'
import {
  listarEntidades,
  criarEntidade,
  renomearEntidade,
  alternarAtivoEntidade,
  type TipoEntidade,
  type EntidadeConfig,
} from '@/lib/config-entidades-actions'
import { ordenarPorNome } from '@/lib/config-entidades'
import type { TipoEntidadeVinculo } from '@/lib/tarefa-tipo-vinculos-actions'
import VincularTarefasModal from './VincularTarefasModal'

interface Props {
  tabela: TipoEntidade
  entidadeTipoVinculo: TipoEntidadeVinculo
  setor: UserSetor
  label: string
}

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function EntidadeListaTab({ tabela, entidadeTipoVinculo, setor, label }: Props) {
  const [itens, setItens] = useState<EntidadeConfig[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')
  const [vinculandoItem, setVinculandoItem] = useState<EntidadeConfig | null>(null)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarEntidades(tabela, setor)
    if (error) setErro(error)
    else { setItens(ordenarPorNome(data)); setErro(null) }
    setCarregando(false)
  }, [tabela, setor])

  useEffect(() => { recarregar() }, [recarregar])

  async function handleCriar() {
    if (!novoNome.trim()) return
    setSalvandoNovo(true)
    const { error } = await criarEntidade(tabela, setor, novoNome)
    if (error) setErro(error)
    else { setNovoNome(''); setErro(null); await recarregar() }
    setSalvandoNovo(false)
  }

  async function handleRenomear(id: string) {
    if (!nomeEditado.trim()) return
    const { error } = await renomearEntidade(tabela, id, nomeEditado)
    if (error) { setErro(error); return }
    setEditandoId(null)
    setErro(null)
    await recarregar()
  }

  async function handleAlternarAtivo(item: EntidadeConfig) {
    const { error } = await alternarAtivoEntidade(tabela, item.id, !item.ativo)
    if (error) { setErro(error); return }
    await recarregar()
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCriar()}
          placeholder={`Novo ${label.toLowerCase()}...`}
          className={inputCls + ' flex-1'}
        />
        <button
          onClick={handleCriar}
          disabled={salvandoNovo || !novoNome.trim()}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          + Criar
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
        <p className="text-[var(--fg)]/40 text-sm">Nenhum {label.toLowerCase()} cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              {editandoId === item.id ? (
                <input
                  value={nomeEditado}
                  onChange={e => setNomeEditado(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRenomear(item.id)}
                  className={inputCls + ' flex-1'}
                  autoFocus
                />
              ) : (
                <span className={`flex-1 text-sm ${item.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                  {item.nome}
                </span>
              )}

              {editandoId === item.id ? (
                <button onClick={() => handleRenomear(item.id)} className="text-xs text-[var(--accent)] font-semibold">
                  Salvar
                </button>
              ) : (
                <button onClick={() => { setEditandoId(item.id); setNomeEditado(item.nome) }} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                  Renomear
                </button>
              )}

              <button onClick={() => setVinculandoItem(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                Vincular tarefas
              </button>

              <button onClick={() => handleAlternarAtivo(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                {item.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {vinculandoItem && (
        <VincularTarefasModal
          entidadeTipo={entidadeTipoVinculo}
          entidadeId={vinculandoItem.id}
          entidadeNome={vinculandoItem.nome}
          setor={setor}
          onClose={() => setVinculandoItem(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

(Combinar com a Task 9, já que `VincularTarefasModal` ainda não existe — ver commit final na Task 10.)

---

### Task 9: `VincularTarefasModal.tsx` — marcar quais tarefas pertencem à entidade

**Files:**
- Create: `app/admin/configuracoes/VincularTarefasModal.tsx`

**Interfaces:**
- Consumes: `listarTarefaTiposDoSetor`, `listarTarefaTipoIdsVinculados`, `alternarVinculo`, `type TipoEntidadeVinculo`, `type TarefaTipoResumo` (`lib/tarefa-tipo-vinculos-actions.ts`, Task 5); `UserSetor` (`lib/types.ts`).
- Produces: componente `VincularTarefasModal` (default export), props `{ entidadeTipo: TipoEntidadeVinculo; entidadeId: string; entidadeNome: string; setor: UserSetor; onClose: () => void }`. Usado por `EntidadeListaTab` (Task 8).

- [ ] **Step 1: Implementar**

```tsx
// app/admin/configuracoes/VincularTarefasModal.tsx
'use client'

import { useEffect, useState } from 'react'
import type { UserSetor } from '@/lib/types'
import {
  listarTarefaTiposDoSetor,
  listarTarefaTipoIdsVinculados,
  alternarVinculo,
  type TipoEntidadeVinculo,
  type TarefaTipoResumo,
} from '@/lib/tarefa-tipo-vinculos-actions'

interface Props {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
  entidadeNome: string
  setor: UserSetor
  onClose: () => void
}

export default function VincularTarefasModal({ entidadeTipo, entidadeId, entidadeNome, setor, onClose }: Props) {
  const [tarefas, setTarefas] = useState<TarefaTipoResumo[]>([])
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const [tarefasRes, vinculosRes] = await Promise.all([
        listarTarefaTiposDoSetor(setor),
        listarTarefaTipoIdsVinculados(entidadeTipo, entidadeId),
      ])
      if (tarefasRes.error) setErro(tarefasRes.error)
      else if (vinculosRes.error) setErro(vinculosRes.error)
      else {
        setTarefas(tarefasRes.data)
        setVinculadas(new Set(vinculosRes.data))
        setErro(null)
      }
      setCarregando(false)
    }
    carregar()
  }, [setor, entidadeTipo, entidadeId])

  async function toggle(tarefaTipoId: string) {
    const jaVinculada = vinculadas.has(tarefaTipoId)
    // Otimista: atualiza a UI antes da resposta, reverte se der erro.
    setVinculadas(prev => {
      const novo = new Set(prev)
      jaVinculada ? novo.delete(tarefaTipoId) : novo.add(tarefaTipoId)
      return novo
    })

    const { error } = await alternarVinculo(tarefaTipoId, entidadeTipo, entidadeId, !jaVinculada)
    if (error) {
      setErro(error)
      setVinculadas(prev => {
        const novo = new Set(prev)
        jaVinculada ? novo.add(tarefaTipoId) : novo.delete(tarefaTipoId)
        return novo
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Tarefas de &quot;{entidadeNome}&quot;</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {erro && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              ⚠ {erro}
            </div>
          )}

          {carregando ? (
            <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
          ) : tarefas.length === 0 ? (
            <p className="text-[var(--fg)]/40 text-sm">Nenhuma tarefa cadastrada no catálogo desse setor ainda.</p>
          ) : (
            <div className="space-y-2">
              {tarefas.map(t => (
                <label key={t.id} className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl hover:bg-[var(--fg)]/5">
                  <input
                    type="checkbox"
                    checked={vinculadas.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-[var(--accent)]"
                  />
                  <span className={`text-sm ${t.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                    {t.nome}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

(Combinar com a Task 10 — ver commit final abaixo.)

---

### Task 10: `TarefasTab.tsx` — catálogo de tarefas do setor (listar, criar, ativar/desativar)

**Files:**
- Create: `app/admin/configuracoes/TarefasTab.tsx`

**Interfaces:**
- Consumes: `listarTarefaTiposDoSetor`, `alternarAtivoTarefaTipo`, `type TarefaTipoResumo` (`lib/tarefa-tipo-vinculos-actions.ts`, Task 5); `NovoTipoTarefaModal` (`components/geral/NovoTipoTarefaModal.tsx`, existente); `UserSetor` (`lib/types.ts`).
- Produces: componente `TarefasTab` (default export), props `{ setor: UserSetor }`. Usado por `ConfiguracoesClient` (Task 7).

- [ ] **Step 1: Implementar**

```tsx
// app/admin/configuracoes/TarefasTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import type { UserSetor } from '@/lib/types'
import { listarTarefaTiposDoSetor, alternarAtivoTarefaTipo, type TarefaTipoResumo } from '@/lib/tarefa-tipo-vinculos-actions'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'

interface Props {
  setor: UserSetor
}

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function TarefasTab({ setor }: Props) {
  const [itens, setItens] = useState<TarefaTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [mostrarModal, setMostrarModal] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarTarefaTiposDoSetor(setor)
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [setor])

  useEffect(() => { recarregar() }, [recarregar])

  async function handleAlternarAtivo(item: TarefaTipoResumo) {
    const { error } = await alternarAtivoTarefaTipo(item.id, !item.ativo)
    if (error) { setErro(error); return }
    await recarregar()
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && novoNome.trim() && setMostrarModal(true)}
          placeholder="Nova tarefa..."
          className={inputCls + ' flex-1'}
        />
        <button
          onClick={() => novoNome.trim() && setMostrarModal(true)}
          disabled={!novoNome.trim()}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          + Criar
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
        <p className="text-[var(--fg)]/40 text-sm">Nenhuma tarefa cadastrada nesse setor ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <span className={`flex-1 text-sm ${item.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                {item.nome}
              </span>
              <button onClick={() => handleAlternarAtivo(item)} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">
                {item.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {mostrarModal && (
        <NovoTipoTarefaModal
          nome={novoNome}
          setor={setor}
          onCancel={() => setMostrarModal(false)}
          onCriado={() => { setMostrarModal(false); setNovoNome(''); recarregar() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar o build/typecheck do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: sem erros (todos os componentes das Tasks 6-10 agora existem e se referenciam corretamente)

- [ ] **Step 3: Rodar a suite de testes completa**

Run: `npm test`
Expected: PASS (nenhum teste quebrado pelas mudanças de UI/actions)

- [ ] **Step 4: Verificação manual no navegador**

Usar `preview_start` pra subir o dev server, logar como admin (ver credenciais de teste de dev já usadas em sessões anteriores), navegar até `/admin/configuracoes` (vai pedir a sessão ADMIN step-up, mesma tela de `/fiscal/parametros`), e confirmar:
1. Trocar entre os 3 setores atualiza a lista.
2. Aba Grupos: criar um grupo, renomear, desativar/ativar, abrir "Vincular tarefas" e marcar/desmarcar uma tarefa (confere no banco que a linha em `tarefa_tipo_vinculos` aparece/some).
3. Repetir para Regimes e Atividades.
4. Aba Tarefas: criar uma tarefa nova via `NovoTipoTarefaModal`, confirmar que aparece na lista e fica disponível pra vincular nas outras abas.
5. Sem console errors (`read_console_messages`).

- [ ] **Step 5: Commit final**

```bash
git add app/admin/configuracoes/ lib/rotas-admin.ts
git commit -m "feat: tela /admin/configuracoes (Grupos, Regimes, Atividades, Tarefas)"
```

---

## Depois deste plano

Com a base pronta (entidades cadastráveis + vínculos com o catálogo), o **Plano B** cobre: migração dos dados de cliente existentes (`clientes_fiscal/contabil/pessoal.grupo/regime/atividade` de texto livre para `regime_id/grupo_id/atividade_id`), a tabela `tarefas_esperadas_mes` (snapshot mensal) e a troca dos ~8 pontos de leitura de `tarefas_personalizadas` pelos vínculos configuráveis — conforme seções "Migração dos dados existentes" e "Geração automática de tarefas" do spec.
