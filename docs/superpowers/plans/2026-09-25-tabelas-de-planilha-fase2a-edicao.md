# Tabelas de planilha — Fase 2A (edição) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a página de leitura de uma tabela em uma grade editável: editar células por tipo, vincular cliente por seletor, adicionar e remover linhas, paginar (100 por página) e filtrar "só sem cliente".

**Architecture:** Server Actions (service role, permissão revalidada em cada chamada) chamam funções SQL atômicas (`jsonb_set`) para não perder edições simultâneas de células diferentes da mesma linha. Lógica pura (permissão, conversão de entrada, paginação) em `lib/tabelas/*` com testes `node --test`. A página vira um Server Component (`TabelaDetalhe`) que carrega uma página de linhas e delega a grade a um Client Component (`TabelaEditavel`).

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), Tailwind v4, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-25-tabelas-de-planilha-design.md` (seção "Fase 2 — Visualização e edição"). **Divisão:** a Fase 2 do spec foi dividida em **2A (este plano: edição, adicionar/remover linha, seletor de cliente, paginação, filtro "só sem cliente")** e **2B (próximo plano: busca geral, filtro por coluna, ordenação, exportar para Excel, gerenciar colunas)**. A Fase 3 (reenvio) segue no spec.

## Global Constraints

- **Next.js diferente do treinamento:** antes de escrever Server Action/rota, ler o guia relevante em `node_modules/next/dist/docs/01-app/` (AGENTS.md do repo). `params` e `searchParams` de páginas são `Promise<...>` (ver `app/fiscal/clientes/[id]/page.tsx`).
- Setores de tabela: `fiscal`, `contabil`, `pessoal`, `societario`, `financeiro` (nunca `configuracoes`).
- Tipos de coluna: `texto`, `numero`, `data`, `opcoes`, `cliente`. Sem Sim/Não.
- **Quem edita:** todo usuário do setor da tabela (e Admin) edita células e linhas (spec: "Todo o setor edita"). **Estrutura** (colunas, excluir tabela) NÃO entra neste plano.
- Valores das células ficam em `dados` por **id da coluna (uuid)**, nunca pelo nome.
- A coluna do tipo `cliente` só é alterada pelo seletor (grava `cliente_id` + o nome do cliente como texto da célula); nunca por texto livre.
- Vínculo com cliente **não exibe nada na ficha do cliente**.
- Escritas só por Server Action com service role; nenhuma policy de escrita nova para usuários comuns.
- Migration `048` é aplicada **manualmente pelo usuário** (nunca rodar contra produção). Toda PR mira `dev`; nunca fazer merge.
- Libs puras usam imports **relativos**; componentes/app usam `@/`.
- `npx tsc --noEmit` type-checa também os testes e tem de ficar limpo (o `node --test` NÃO checa tipos).
- Texto de UI em português. Trabalhar no worktree isolado a partir de `origin/dev`.

## Review Focus

1. **Duas pessoas editando células diferentes da mesma linha ao mesmo tempo** não podem sobrescrever uma à outra (por isso `jsonb_set` numa função SQL, não ler-e-regravar no JS). *(Task 1)*
2. **Editar uma coluna que não pertence à tabela da linha** (ids cruzados) ou uma linha de outro setor/sem permissão via chamada direta da Server Action: rejeitado. *(Task 4, revisão adversarial)*
3. **Número inválido (`abc`), data impossível (`31/02/2026`) ou opção fora da lista**: erro claro, a célula volta ao valor anterior e nada é gravado. *(Task 3)*
4. **Apagar o conteúdo da célula** (campo vazio) grava `null`, não string vazia. *(Task 3)*
5. **`?pagina=999`, `?pagina=0`, `?pagina=abc`**: clampa para uma página válida; tabela vazia continua com 1 página. *(Task 2)*
6. **Remover uma linha que outra pessoa já removeu**: erro amigável, sem quebrar a tela. *(Task 4)*

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/048_planilhas_edicao.sql` | Funções `editar_celula_planilha`, `vincular_cliente_linha`, `adicionar_linha_planilha` |
| `lib/tabelas/permissoes.ts` | `podeEditarLinhas` |
| `lib/tabelas/paginacao.ts` | `paginar`, `POR_PAGINA` |
| `lib/tabelas/editar-celula.ts` | `ehUuid`, `converterEntradaCelula` |
| `lib/tabelas-edicao-actions.ts` | Server Actions `editarCelula`, `definirClienteDaLinha`, `adicionarLinha`, `removerLinha` |
| `components/tabelas/TabelaDetalhe.tsx` | Server Component: carrega página de linhas, permissão, clientes |
| `components/tabelas/TabelaEditavel.tsx` | Client Component: grade editável/somente leitura |
| `components/tabelas/TabelaLeitura.tsx` | **Removido** (substituído por `TabelaDetalhe`) |
| `app/<setor>/tabelas/[id]/page.tsx` (×5) | Passam `searchParams` ao `TabelaDetalhe` |

---

### Task 1: Migration 048 (funções de edição)

**Files:**
- Create: `supabase/migrations/048_planilhas_edicao.sql`

**Interfaces:**
- Produces (todas `security definer`, `search_path = public`, executáveis só por `service_role`):
  - `editar_celula_planilha(p_linha uuid, p_coluna uuid, p_valor jsonb) returns boolean` — `true` se a linha existia.
  - `vincular_cliente_linha(p_linha uuid, p_coluna uuid, p_cliente uuid, p_nome text) returns boolean` — `p_cliente null` só desvincula (mantém o texto da célula); senão grava `cliente_id` e o nome na célula.
  - `adicionar_linha_planilha(p_planilha uuid) returns uuid` — id da nova linha, `ordem = max + 1`.

- [ ] **Step 1: Confirmar que o número 048 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -2 && gh pr list --state open --json headRefName`
Expected: última migration `047_planilhas.sql`; nenhum PR aberto com migration `048`. Se houver, usar o próximo número livre em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/048_planilhas_edicao.sql
--
-- Funções de edição das tabelas de planilha. Chamadas só pelas Server Actions
-- (service role), que já validaram sessão, permissão de setor e tipo do valor.
--
-- editar_celula_planilha usa jsonb_set num único UPDATE: no READ COMMITTED o
-- Postgres reavalia a expressão SET sobre a versão mais recente da linha, então
-- duas pessoas editando células DIFERENTES da mesma linha ao mesmo tempo não
-- sobrescrevem uma à outra (ler-e-regravar no JS perderia uma das edições).

create or replace function editar_celula_planilha(p_linha uuid, p_coluna uuid, p_valor jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilha_linhas
     set dados = jsonb_set(dados, array[p_coluna::text], coalesce(p_valor, 'null'::jsonb), true),
         updated_at = now()
   where id = p_linha;
  return found;
end;
$$;

create or replace function vincular_cliente_linha(p_linha uuid, p_coluna uuid, p_cliente uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cliente is null then
    -- Só desvincula: o texto original da célula continua, e a linha volta a
    -- aparecer no filtro "sem cliente".
    update planilha_linhas
       set cliente_id = null, updated_at = now()
     where id = p_linha;
  else
    update planilha_linhas
       set cliente_id = p_cliente,
           dados = jsonb_set(dados, array[p_coluna::text], to_jsonb(p_nome), true),
           updated_at = now()
     where id = p_linha;
  end if;
  return found;
end;
$$;

create or replace function adicionar_linha_planilha(p_planilha uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Serializa adições simultâneas na mesma tabela para não repetir `ordem`.
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  insert into planilha_linhas (planilha_id, dados, ordem)
  select p_planilha, '{}'::jsonb, coalesce(max(ordem), -1) + 1
  from planilha_linhas
  where planilha_id = p_planilha
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function editar_celula_planilha(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function vincular_cliente_linha(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function adicionar_linha_planilha(uuid) from public, anon, authenticated;
grant execute on function editar_celula_planilha(uuid, uuid, jsonb) to service_role;
grant execute on function vincular_cliente_linha(uuid, uuid, uuid, text) to service_role;
grant execute on function adicionar_linha_planilha(uuid) to service_role;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_planilhas_edicao.sql
git commit -m "feat(tabelas): migration 048 com funções atômicas de edição de células e linhas"
```

---

### Task 2: Permissão e paginação (`lib/tabelas/permissoes.ts`, `lib/tabelas/paginacao.ts`)

**Files:**
- Create: `lib/tabelas/permissoes.ts`, `lib/tabelas/paginacao.ts`
- Test: `tests/tabelas-permissoes.test.ts`, `tests/tabelas-paginacao.test.ts`

**Interfaces:**
- Consumes: `SetorTabela` de `./montar-payload`.
- Produces:
  - `podeEditarLinhas(perfil: { role?: string | null; setores?: string[] | null } | null | undefined, setor: SetorTabela): boolean`
  - `const POR_PAGINA = 100`
  - `paginar(paginaBruta: string | undefined, total: number, porPagina?: number): { pagina: number; totalPaginas: number; de: number; ate: number }` — `de`/`ate` são índices 0-based inclusivos para `.range(de, ate)`.

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-permissoes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeEditarLinhas } from '../lib/tabelas/permissoes'

test('admin edita qualquer setor', () => {
  assert.equal(podeEditarLinhas({ role: 'admin', setores: [] }, 'fiscal'), true)
})

test('usuário do setor edita', () => {
  assert.equal(podeEditarLinhas({ role: 'operador', setores: ['fiscal', 'pessoal'] }, 'pessoal'), true)
})

test('usuário de outro setor não edita', () => {
  assert.equal(podeEditarLinhas({ role: 'operador', setores: ['fiscal'] }, 'financeiro'), false)
})

test('perfil ausente ou sem setores nunca edita', () => {
  assert.equal(podeEditarLinhas(null, 'fiscal'), false)
  assert.equal(podeEditarLinhas(undefined, 'fiscal'), false)
  assert.equal(podeEditarLinhas({ role: 'operador', setores: null }, 'fiscal'), false)
})
```

```ts
// tests/tabelas-paginacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginar, POR_PAGINA } from '../lib/tabelas/paginacao'

test('POR_PAGINA é 100', () => {
  assert.equal(POR_PAGINA, 100)
})

test('primeira página de 250 linhas', () => {
  assert.deepEqual(paginar('1', 250), { pagina: 1, totalPaginas: 3, de: 0, ate: 99 })
})

test('última página parcial', () => {
  assert.deepEqual(paginar('3', 250), { pagina: 3, totalPaginas: 3, de: 200, ate: 299 })
})

test('página acima do total é limitada à última', () => {
  assert.equal(paginar('999', 250).pagina, 3)
  assert.equal(paginar('999999', 250).pagina, 3)
})

test('página inválida (0, negativa, texto, ausente) vira 1', () => {
  assert.equal(paginar('0', 250).pagina, 1)
  assert.equal(paginar('-2', 250).pagina, 1)
  assert.equal(paginar('abc', 250).pagina, 1)
  assert.equal(paginar(undefined, 250).pagina, 1)
})

test('tabela vazia tem 1 página', () => {
  assert.deepEqual(paginar('1', 0), { pagina: 1, totalPaginas: 1, de: 0, ate: 99 })
})

test('porPagina customizado', () => {
  assert.deepEqual(paginar('2', 25, 10), { pagina: 2, totalPaginas: 3, de: 10, ate: 19 })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-permissoes.test.ts tests/tabelas-paginacao.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/permissoes.ts
import type { SetorTabela } from './montar-payload'

interface Perfil { role?: string | null; setores?: string[] | null }

// Regra do spec: todo o setor edita células e linhas; Admin edita qualquer
// setor. (Estrutura — colunas, excluir tabela — é outra regra, da Fase 2B.)
export function podeEditarLinhas(perfil: Perfil | null | undefined, setor: SetorTabela): boolean {
  return perfil?.role === 'admin' || (perfil?.setores ?? []).includes(setor)
}
```

```ts
// lib/tabelas/paginacao.ts
export const POR_PAGINA = 100

export function paginar(
  paginaBruta: string | undefined,
  total: number,
  porPagina: number = POR_PAGINA,
): { pagina: number; totalPaginas: number; de: number; ate: number } {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const n = Number.parseInt(paginaBruta ?? '1', 10)
  const pagina = Number.isFinite(n) ? Math.min(Math.max(n, 1), totalPaginas) : 1
  return { pagina, totalPaginas, de: (pagina - 1) * porPagina, ate: pagina * porPagina - 1 }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-permissoes.test.ts tests/tabelas-paginacao.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/permissoes.ts lib/tabelas/paginacao.ts tests/tabelas-permissoes.test.ts tests/tabelas-paginacao.test.ts
git commit -m "feat(tabelas): permissão de edição por setor e paginação de 100 linhas"
```

---

### Task 3: Conversão da entrada de célula (`lib/tabelas/editar-celula.ts`)

**Files:**
- Create: `lib/tabelas/editar-celula.ts`
- Test: `tests/tabelas-editar-celula.test.ts`

**Interfaces:**
- Consumes: `paraNumero`, `paraDataISO`, `TipoColuna`, `OpcaoColuna`, `ValorCelula` de `./tipos`.
- Produces:
  - `ehUuid(v: unknown): v is string`
  - `const MAX_TEXTO_CELULA = 5000`
  - `type ResultadoCelula = { ok: true; valor: ValorCelula } | { ok: false; erro: string }`
  - `converterEntradaCelula(tipo: TipoColuna, entrada: unknown, opcoes: OpcaoColuna[] | null): ResultadoCelula`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-editar-celula.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { converterEntradaCelula, ehUuid, MAX_TEXTO_CELULA } from '../lib/tabelas/editar-celula'

const OPCOES = [{ valor: 'Pendente', cor: '#f59e0b' }, { valor: 'Feito', cor: '#10b981' }]

test('ehUuid aceita uuid e rejeita o resto', () => {
  assert.equal(ehUuid('11111111-1111-4111-8111-111111111111'), true)
  assert.equal(ehUuid('abc'), false)
  assert.equal(ehUuid(null), false)
  assert.equal(ehUuid(42), false)
})

test('vazio, espaços e null viram null em qualquer tipo editável', () => {
  for (const tipo of ['texto', 'numero', 'data', 'opcoes'] as const) {
    assert.deepEqual(converterEntradaCelula(tipo, '', OPCOES), { ok: true, valor: null })
    assert.deepEqual(converterEntradaCelula(tipo, '   ', OPCOES), { ok: true, valor: null })
    assert.deepEqual(converterEntradaCelula(tipo, null, OPCOES), { ok: true, valor: null })
  }
})

test('texto é aparado e tem limite', () => {
  assert.deepEqual(converterEntradaCelula('texto', '  oi  ', null), { ok: true, valor: 'oi' })
  const r = converterEntradaCelula('texto', 'x'.repeat(MAX_TEXTO_CELULA + 1), null)
  assert.equal(r.ok, false)
})

test('número aceita formato brasileiro e recusa lixo', () => {
  assert.deepEqual(converterEntradaCelula('numero', '1.234,56', null), { ok: true, valor: 1234.56 })
  assert.deepEqual(converterEntradaCelula('numero', '12,5', null), { ok: true, valor: 12.5 })
  assert.deepEqual(converterEntradaCelula('numero', 7, null), { ok: true, valor: 7 })
  const r = converterEntradaCelula('numero', 'abc', null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /número/i)
})

test('data aceita AAAA-MM-DD e DD/MM/AAAA e recusa datas impossíveis', () => {
  assert.deepEqual(converterEntradaCelula('data', '2026-03-15', null), { ok: true, valor: '2026-03-15' })
  assert.deepEqual(converterEntradaCelula('data', '15/03/2026', null), { ok: true, valor: '2026-03-15' })
  const r = converterEntradaCelula('data', '31/02/2026', null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /data/i)
})

test('opções só aceita valores da lista', () => {
  assert.deepEqual(converterEntradaCelula('opcoes', 'Feito', OPCOES), { ok: true, valor: 'Feito' })
  const r = converterEntradaCelula('opcoes', 'Inventado', OPCOES)
  assert.equal(r.ok, false)
  assert.equal(converterEntradaCelula('opcoes', 'Feito', null).ok, false)
})

test('cliente nunca é editado como texto', () => {
  const r = converterEntradaCelula('cliente', 'Empresa A', null)
  assert.equal(r.ok, false)
})

test('tipo de entrada inesperado (objeto, booleano) é recusado', () => {
  assert.equal(converterEntradaCelula('texto', { a: 1 }, null).ok, false)
  assert.equal(converterEntradaCelula('texto', true, null).ok, false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-editar-celula.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/editar-celula.ts
import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export const MAX_TEXTO_CELULA = 5000

export type ResultadoCelula = { ok: true; valor: ValorCelula } | { ok: false; erro: string }

const erro = (msg: string): ResultadoCelula => ({ ok: false, erro: msg })

// Converte o que o usuário digitou/escolheu para o valor guardado na célula.
// Campo vazio vira null. O que não converte é RECUSADO (a edição, ao contrário
// da importação, não guarda texto solto em coluna de número/data).
export function converterEntradaCelula(
  tipo: TipoColuna,
  entrada: unknown,
  opcoes: OpcaoColuna[] | null,
): ResultadoCelula {
  if (tipo === 'cliente') return erro('A coluna de cliente é alterada pelo seletor de cliente.')
  if (entrada === null || entrada === undefined) return { ok: true, valor: null }
  if (typeof entrada !== 'string' && typeof entrada !== 'number') return erro('Valor inválido.')

  const texto = String(entrada).trim()
  if (texto === '') return { ok: true, valor: null }

  switch (tipo) {
    case 'texto':
      if (texto.length > MAX_TEXTO_CELULA) return erro(`O texto pode ter no máximo ${MAX_TEXTO_CELULA} caracteres.`)
      return { ok: true, valor: texto }
    case 'numero': {
      const n = paraNumero(texto)
      return n === null ? erro('Número inválido. Use dígitos, com vírgula para decimais (ex.: 1.234,56).') : { ok: true, valor: n }
    }
    case 'data': {
      const d = paraDataISO(texto)
      return d === null ? erro('Data inválida. Use DD/MM/AAAA.') : { ok: true, valor: d }
    }
    case 'opcoes':
      return (opcoes ?? []).some(o => o.valor === texto) ? { ok: true, valor: texto } : erro('Opção inválida: escolha um valor da lista.')
    default:
      return erro('Tipo de coluna desconhecido.')
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-editar-celula.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/editar-celula.ts tests/tabelas-editar-celula.test.ts
git commit -m "feat(tabelas): conversão e validação da entrada de célula por tipo"
```

---

### Task 4: Server Actions de edição (`lib/tabelas-edicao-actions.ts`)

**Files:**
- Create: `lib/tabelas-edicao-actions.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAdmin` de `./supabase/server`; `podeEditarLinhas` (Task 2); `converterEntradaCelula`, `ehUuid` (Task 3); RPCs da Task 1; `SetorTabela` de `./tabelas/montar-payload`; `ValorCelula`, `OpcaoColuna`, `TipoColuna` de `./tabelas/tipos`.
- Produces (todas `async`, tudo revalida sessão + permissão do setor da tabela da linha):
  - `editarCelula(entrada: { linhaId: string; colunaId: string; valor: unknown }): Promise<{ error: string | null; valor?: ValorCelula }>`
  - `definirClienteDaLinha(entrada: { linhaId: string; colunaId: string; clienteId: string | null }): Promise<{ error: string | null; nome?: string | null }>`
  - `adicionarLinha(planilhaId: string): Promise<{ error: string | null; id?: string }>`
  - `removerLinha(linhaId: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Ler a doc de Server Actions**

Run: `ls node_modules/next/dist/docs/01-app/02-guides/ | head -30` e conferir que um arquivo `'use server'` só pode exportar funções `async` (helpers internos não exportados são permitidos). Padrão a seguir: `lib/tabelas-actions.ts`.

- [ ] **Step 2: Escrever as actions**

```ts
// lib/tabelas-edicao-actions.ts
'use server'

import { getAuthenticatedAdmin } from './supabase/server'
import { podeEditarLinhas } from './tabelas/permissoes'
import { converterEntradaCelula, ehUuid } from './tabelas/editar-celula'
import type { SetorTabela } from './tabelas/montar-payload'
import type { OpcaoColuna, TipoColuna, ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; setor: SetorTabela }

// Sessão + tabela + permissão do setor dessa tabela. NUNCA confia em setor
// vindo do cliente: o setor é sempre lido da própria tabela.
async function contextoDaPlanilha(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, setor').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores').eq('id', user.id).single()
  if (!podeEditarLinhas(profile, planilha.setor as SetorTabela)) return { error: 'Acesso negado.' }

  return { error: null, supabase, planilhaId: planilha.id as string, setor: planilha.setor as SetorTabela }
}

async function contextoDaLinha(linhaId: string): Promise<Contexto> {
  if (!ehUuid(linhaId)) return { error: 'Linha inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }
  const { data: linha } = await supabase.from('planilha_linhas').select('id, planilha_id').eq('id', linhaId).maybeSingle()
  if (!linha) return { error: 'Essa linha não existe mais (talvez outra pessoa a removeu). Recarregue a página.' }
  return contextoDaPlanilha(linha.planilha_id as string)
}

interface ColunaDB { id: string; planilha_id: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

// A coluna precisa pertencer à MESMA tabela do contexto (impede ids cruzados).
async function colunaDaTabela(supabase: Admin, colunaId: string, planilhaId: string): Promise<ColunaDB | null> {
  if (!ehUuid(colunaId)) return null
  const { data } = await supabase.from('planilha_colunas').select('id, planilha_id, tipo, opcoes').eq('id', colunaId).maybeSingle()
  if (!data || data.planilha_id !== planilhaId) return null
  return data as ColunaDB
}

export async function editarCelula(
  entrada: { linhaId: string; colunaId: string; valor: unknown },
): Promise<{ error: string | null; valor?: ValorCelula }> {
  const ctx = await contextoDaLinha(entrada?.linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const coluna = await colunaDaTabela(ctx.supabase, entrada.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }

  const convertido = converterEntradaCelula(coluna.tipo, entrada.valor, coluna.opcoes)
  if (!convertido.ok) return { error: convertido.erro }

  const { data, error } = await ctx.supabase.rpc('editar_celula_planilha', {
    p_linha: entrada.linhaId,
    p_coluna: coluna.id,
    p_valor: convertido.valor,
  })
  if (error) return { error: 'Não foi possível salvar a alteração.' }
  if (!data) return { error: 'Essa linha não existe mais. Recarregue a página.' }
  return { error: null, valor: convertido.valor }
}

export async function definirClienteDaLinha(
  entrada: { linhaId: string; colunaId: string; clienteId: string | null },
): Promise<{ error: string | null; nome?: string | null }> {
  const ctx = await contextoDaLinha(entrada?.linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const coluna = await colunaDaTabela(ctx.supabase, entrada.colunaId, ctx.planilhaId)
  if (!coluna || coluna.tipo !== 'cliente') return { error: 'Coluna inválida.' }

  let nome: string | null = null
  if (entrada.clienteId !== null) {
    if (!ehUuid(entrada.clienteId)) return { error: 'Cliente inválido.' }
    const { data: cliente } = await ctx.supabase.from('clientes').select('nome').eq('id', entrada.clienteId).maybeSingle()
    if (!cliente) return { error: 'Cliente não encontrado.' }
    nome = cliente.nome as string
  }

  const { data, error } = await ctx.supabase.rpc('vincular_cliente_linha', {
    p_linha: entrada.linhaId,
    p_coluna: coluna.id,
    p_cliente: entrada.clienteId,
    p_nome: nome,
  })
  if (error) return { error: 'Não foi possível salvar o cliente.' }
  if (!data) return { error: 'Essa linha não existe mais. Recarregue a página.' }
  return { error: null, nome }
}

export async function adicionarLinha(planilhaId: string): Promise<{ error: string | null; id?: string }> {
  const ctx = await contextoDaPlanilha(planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('adicionar_linha_planilha', { p_planilha: ctx.planilhaId })
  if (error || !data) return { error: 'Não foi possível adicionar a linha.' }
  return { error: null, id: data as string }
}

export async function removerLinha(linhaId: string): Promise<{ error: string | null }> {
  const ctx = await contextoDaLinha(linhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.from('planilha_linhas').delete().eq('id', linhaId).select('id')
  if (error) return { error: 'Não foi possível remover a linha.' }
  if (!data || data.length === 0) return { error: 'Essa linha já foi removida. Recarregue a página.' }
  return { error: null }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros. Se o TypeScript não estreitar `ctx` após `if (ctx.error !== null) return`, ajustar o tipo `Contexto` (união discriminada por `error`) — não usar `any`.

- [ ] **Step 4: Commit**

```bash
git add lib/tabelas-edicao-actions.ts
git commit -m "feat(tabelas): Server Actions para editar célula, vincular cliente, adicionar e remover linha"
```

---

### Task 5: Grade editável (`components/tabelas/TabelaEditavel.tsx`)

**Files:**
- Create: `components/tabelas/TabelaEditavel.tsx`

**Interfaces:**
- Consumes: `editarCelula`, `definirClienteDaLinha`, `adicionarLinha`, `removerLinha` (Task 4); `formatarValor` de `@/lib/tabelas/formatar`; `ClienteMatch` de `@/lib/tabelas/cliente-match`; `OpcaoColuna`, `TipoColuna`, `ValorCelula` de `@/lib/tabelas/tipos`.
- Produces: default export `TabelaEditavel({ planilhaId, colunas, linhas, clientes, podeEditar })`; tipos exportados `ColunaGrade { id; nome; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }` e `LinhaGrade { id; dados: Record<string, ValorCelula>; cliente_id: string | null }`.

Comportamento: com `podeEditar = false` renderiza só texto (como a antiga leitura). Com `true`: texto/número = `<input>` que salva ao sair do campo (`onBlur`) ou com Enter; data = `<input type="date">`; opções = `<select>` (salva ao escolher); cliente = `<select>` de clientes com "Sem cliente". Estado por célula: "salvando", erro (mensagem, borda vermelha e o campo volta ao valor anterior). Botão "Adicionar linha" leva à última página (`?pagina=999999`, a paginação limita ao último valor válido). Remover linha pede confirmação.

- [ ] **Step 1: Escrever o componente**

```tsx
// components/tabelas/TabelaEditavel.tsx
'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { editarCelula, definirClienteDaLinha, adicionarLinha, removerLinha } from '@/lib/tabelas-edicao-actions'
import { formatarValor } from '@/lib/tabelas/formatar'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import type { OpcaoColuna, TipoColuna, ValorCelula } from '@/lib/tabelas/tipos'

export interface ColunaGrade { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
export interface LinhaGrade { id: string; dados: Record<string, ValorCelula>; cliente_id: string | null }

interface Props {
  planilhaId: string
  colunas: ColunaGrade[]
  linhas: LinhaGrade[]
  clientes: ClienteMatch[]
  podeEditar: boolean
}

type Estado = { estado: 'salvando' } | { estado: 'erro'; msg: string }

const campoCls = 'w-full min-w-[8rem] px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

// O que aparece dentro do campo de edição (não o texto formatado da leitura).
function textoDeEdicao(tipo: TipoColuna, valor: ValorCelula): string {
  if (valor === null) return ''
  if (tipo === 'numero' && typeof valor === 'number') return String(valor).replace('.', ',')
  return String(valor)
}

export default function TabelaEditavel({ planilhaId, colunas, linhas, clientes, podeEditar }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  // Valores já salvos com sucesso nesta sessão, por cima do que veio do servidor.
  const [salvos, setSalvos] = useState<Record<string, ValorCelula>>({})
  const [vinculos, setVinculos] = useState<Record<string, string | null>>({})
  const [estados, setEstados] = useState<Record<string, Estado>>({})
  const [ocupado, setOcupado] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const chave = (linhaId: string, colunaId: string) => `${linhaId}:${colunaId}`
  const valorAtual = (l: LinhaGrade, c: ColunaGrade): ValorCelula => {
    const k = chave(l.id, c.id)
    return k in salvos ? salvos[k] : (l.dados[c.id] ?? null)
  }
  const clienteAtual = (l: LinhaGrade): string | null => (l.id in vinculos ? vinculos[l.id] : l.cliente_id)

  function limparEstado(k: string) {
    setEstados(e => { const n = { ...e }; delete n[k]; return n })
  }

  async function salvarCelula(l: LinhaGrade, c: ColunaGrade, entrada: string) {
    const k = chave(l.id, c.id)
    setEstados(e => ({ ...e, [k]: { estado: 'salvando' } }))
    try {
      const r = await editarCelula({ linhaId: l.id, colunaId: c.id, valor: entrada })
      if (r.error) { setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: r.error as string } })); return }
      setSalvos(s => ({ ...s, [k]: r.valor ?? null }))
      limparEstado(k)
    } catch {
      setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Falha de conexão ao salvar.' } }))
    }
  }

  async function salvarCliente(l: LinhaGrade, c: ColunaGrade, clienteId: string) {
    const k = chave(l.id, c.id)
    setEstados(e => ({ ...e, [k]: { estado: 'salvando' } }))
    try {
      const r = await definirClienteDaLinha({ linhaId: l.id, colunaId: c.id, clienteId: clienteId || null })
      if (r.error) { setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: r.error as string } })); return }
      setVinculos(v => ({ ...v, [l.id]: clienteId || null }))
      if (r.nome) setSalvos(s => ({ ...s, [k]: r.nome as string }))
      limparEstado(k)
    } catch {
      setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Falha de conexão ao salvar.' } }))
    }
  }

  async function aoAdicionar() {
    setOcupado(true); setErroGeral(null)
    try {
      const r = await adicionarLinha(planilhaId)
      if (r.error) { setErroGeral(r.error); return }
      // A paginação limita 999999 à última página, onde a linha nova aparece.
      router.push(`${pathname}?pagina=999999`)
    } catch {
      setErroGeral('Falha de conexão ao adicionar a linha.')
    } finally {
      setOcupado(false)
    }
  }

  async function aoRemover(l: LinhaGrade) {
    if (!confirm('Remover esta linha? Essa ação não pode ser desfeita.')) return
    setOcupado(true); setErroGeral(null)
    try {
      const r = await removerLinha(l.id)
      if (r.error) setErroGeral(r.error)
      router.refresh()
    } catch {
      setErroGeral('Falha de conexão ao remover a linha.')
    } finally {
      setOcupado(false)
    }
  }

  function celulaSomenteLeitura(l: LinhaGrade, c: ColunaGrade) {
    const valor = valorAtual(l, c)
    const texto = formatarValor(c.tipo, valor)
    const cor = c.tipo === 'opcoes' ? c.opcoes?.find(o => o.valor === valor)?.cor : undefined
    return (
      <>
        {cor ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ backgroundColor: cor + '25', color: cor, border: `1px solid ${cor}50` }}>{texto}</span>
        ) : texto}
        {c.tipo === 'cliente' && !clienteAtual(l) && valor !== null && (
          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">sem cliente</span>
        )}
      </>
    )
  }

  function celulaEditavel(l: LinhaGrade, c: ColunaGrade) {
    const k = chave(l.id, c.id)
    const est = estados[k]
    const valor = valorAtual(l, c)
    const bordaCls = est?.estado === 'erro' ? 'border-red-500/60' : 'border-[var(--fg)]/10'
    const desabilitado = est?.estado === 'salvando'

    let campo: React.ReactNode
    if (c.tipo === 'opcoes') {
      campo = (
        <select className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={valor === null ? '' : String(valor)}
          onChange={e => salvarCelula(l, c, e.target.value)}>
          <option value="">—</option>
          {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
        </select>
      )
    } else if (c.tipo === 'cliente') {
      campo = (
        <select className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={clienteAtual(l) ?? ''}
          onChange={e => salvarCliente(l, c, e.target.value)}>
          <option value="">Sem cliente{valor !== null ? ` (${String(valor)})` : ''}</option>
          {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
        </select>
      )
    } else {
      const inicial = textoDeEdicao(c.tipo, valor)
      campo = (
        <input
          // O key força o campo a voltar ao valor salvo quando o servidor recusa a edição.
          key={`${k}:${inicial}:${est?.estado ?? ''}`}
          type={c.tipo === 'data' ? 'date' : 'text'}
          inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
          className={`${campoCls} ${bordaCls}`}
          disabled={desabilitado}
          defaultValue={c.tipo === 'data' && typeof valor === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(valor) ? '' : inicial}
          onBlur={e => { if (e.target.value.trim() !== inicial) salvarCelula(l, c, e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      )
    }

    return (
      <div>
        {campo}
        {est?.estado === 'salvando' && <span className="text-[10px] text-[var(--fg)]/40">salvando…</span>}
        {est?.estado === 'erro' && <span className="block text-[10px] text-red-400 mt-0.5 max-w-[16rem] whitespace-normal">{est.msg}</span>}
      </div>
    )
  }

  return (
    <div>
      {podeEditar && (
        <div className="flex items-center gap-3 mb-3">
          <button onClick={aoAdicionar} disabled={ocupado}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
            Adicionar linha
          </button>
          {erroGeral && <span className="text-xs text-red-400">{erroGeral}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {colunas.map(c => (
                <th key={c.id} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                  {c.nome}
                </th>
              ))}
              {podeEditar && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.id} className="border-b border-[var(--fg)]/8 align-top">
                {colunas.map(c => (
                  <td key={c.id} className={`px-4 py-2.5 text-sm text-[var(--fg)] ${podeEditar ? '' : 'whitespace-nowrap'}`}>
                    {podeEditar ? celulaEditavel(l, c) : celulaSomenteLeitura(l, c)}
                  </td>
                ))}
                {podeEditar && (
                  <td className="px-2 py-2.5">
                    <button onClick={() => aoRemover(l)} disabled={ocupado} title="Remover linha"
                      className="text-red-400/60 hover:text-red-400 text-lg leading-none px-1 disabled:opacity-40">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Nenhuma linha.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas`
Expected: sem erros (o `react-hooks` não deve acusar setState em efeito; não há `useEffect`). Se o lint acusar `React` não definido para `React.ReactNode`, importar `type ReactNode` de `react`.

- [ ] **Step 3: Commit**

```bash
git add components/tabelas/TabelaEditavel.tsx
git commit -m "feat(tabelas): grade editável com edição por tipo, seletor de cliente, adicionar e remover linha"
```

---

### Task 6: Página `TabelaDetalhe` com paginação e filtro (substitui `TabelaLeitura`)

**Files:**
- Create: `components/tabelas/TabelaDetalhe.tsx`
- Delete: `components/tabelas/TabelaLeitura.tsx`
- Modify: `app/{fiscal,contabil,pessoal,societario,financeiro}/tabelas/[id]/page.tsx` (5 arquivos)

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`; `podeEditarLinhas` (Task 2); `paginar`, `POR_PAGINA` (Task 2); `SetorTabela`; `ClienteMatch` de `@/lib/tabelas/cliente-match`; `TabelaEditavel`, `ColunaGrade`, `LinhaGrade` de `./TabelaEditavel` (Task 5).
- Produces: default export `TabelaDetalhe({ setor, id, pagina, semCliente }: { setor: SetorTabela; id: string; pagina?: string; semCliente: boolean })` (Server Component; `notFound()` se a tabela não existir ou for de outro setor).

- [ ] **Step 1: Escrever o Server Component**

```tsx
// components/tabelas/TabelaDetalhe.tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeEditarLinhas } from '@/lib/tabelas/permissoes'
import { paginar, POR_PAGINA } from '@/lib/tabelas/paginacao'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import TabelaEditavel, { type ColunaGrade, type LinhaGrade } from './TabelaEditavel'

interface Props {
  setor: SetorTabela
  id: string
  pagina?: string
  semCliente: boolean
}

export default async function TabelaDetalhe({ setor, id, pagina: paginaBruta, semCliente }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', id).maybeSingle()
  if (!planilha || planilha.setor !== setor) notFound()

  const [{ data: profile }, { data: colunasRaw }] = await Promise.all([
    supabase.from('profiles').select('role, setores').eq('id', user.id).single(),
    supabase.from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', id).order('ordem'),
  ])
  const colunas = (colunasRaw ?? []) as ColunaGrade[]
  const temColunaCliente = colunas.some(c => c.tipo === 'cliente')
  const filtrarSemCliente = semCliente && temColunaCliente
  const podeEditar = podeEditarLinhas(profile, setor)

  let contagem = supabase.from('planilha_linhas').select('id', { count: 'exact', head: true }).eq('planilha_id', id)
  if (filtrarSemCliente) contagem = contagem.is('cliente_id', null)
  const { count } = await contagem
  const total = count ?? 0
  const { pagina, totalPaginas, de, ate } = paginar(paginaBruta, total)

  let consulta = supabase.from('planilha_linhas').select('id, dados, cliente_id')
    .eq('planilha_id', id).order('ordem').range(de, ate)
  if (filtrarSemCliente) consulta = consulta.is('cliente_id', null)
  const { data: linhasRaw } = await consulta
  const linhas = (linhasRaw ?? []) as LinhaGrade[]

  // A lista de clientes só é buscada para quem pode editar e se há coluna Cliente.
  // (PostgREST limita a 1000 linhas por consulta; acima disso o seletor fica parcial.)
  let clientes: ClienteMatch[] = []
  if (podeEditar && temColunaCliente) {
    const { data } = await supabase.from('clientes').select('id, nome, cnpj').order('nome')
    clientes = (data ?? []) as ClienteMatch[]
  }

  const base = `/${setor}/tabelas/${id}`
  const link = (p: number, sem: boolean) => {
    const qs = new URLSearchParams()
    if (p > 1) qs.set('pagina', String(p))
    if (sem) qs.set('semCliente', '1')
    const s = qs.toString()
    return s ? `${base}?${s}` : base
  }

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-4">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'linha' : 'linhas'}
        {filtrarSemCliente ? ' sem cliente' : ''}
        {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ''}
        {podeEditar ? '' : ' · somente leitura'}
      </p>

      {temColunaCliente && (
        <div className="flex gap-2 mb-4 text-xs">
          <Link href={link(1, false)}
            className={`px-3 py-1.5 rounded-lg border ${!filtrarSemCliente ? 'bg-[var(--fg)]/10 border-[var(--fg)]/20 text-[var(--fg)]' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Todas
          </Link>
          <Link href={link(1, true)}
            className={`px-3 py-1.5 rounded-lg border ${filtrarSemCliente ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Só sem cliente
          </Link>
        </div>
      )}

      <TabelaEditavel
        key={`${pagina}-${filtrarSemCliente}`}
        planilhaId={id}
        colunas={colunas}
        linhas={linhas}
        clientes={clientes}
        podeEditar={podeEditar}
      />

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[var(--fg)]/50">
          {pagina > 1
            ? <Link href={link(pagina - 1, filtrarSemCliente)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">← Anterior</Link>
            : <span />}
          <span>Página {pagina} de {totalPaginas} · {POR_PAGINA} por página</span>
          {pagina < totalPaginas
            ? <Link href={link(pagina + 1, filtrarSemCliente)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">Próxima →</Link>
            : <span />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Remover o componente antigo e atualizar as 5 rotas**

```bash
git rm components/tabelas/TabelaLeitura.tsx
```

Para cada setor `S` em `fiscal contabil pessoal societario financeiro`, substituir `app/S/tabelas/[id]/page.tsx` por (trocar `"S"` pelo setor literal de cada diretório — erro de copiar/colar é defeito real):

```tsx
import TabelaDetalhe from '@/components/tabelas/TabelaDetalhe'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string; semCliente?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  return <TabelaDetalhe setor="S" id={id} pagina={sp.pagina} semCliente={sp.semCliente === '1'} />
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas app/*/tabelas && npm test`
Expected: sem erros; testes verdes. Conferir por grep que cada rota tem o literal do próprio setor: `grep -H 'setor="' app/*/tabelas/\[id\]/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/tabelas/TabelaDetalhe.tsx app/fiscal/tabelas app/contabil/tabelas app/pessoal/tabelas app/societario/tabelas app/financeiro/tabelas
git commit -m "feat(tabelas): página de detalhe com paginação, filtro sem cliente e permissão de edição"
```

---

### Task 7: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test && npx eslint components/tabelas lib/tabelas lib/tabelas-edicao-actions.ts app/*/tabelas`
Expected: `tsc` limpo; todos os testes passam; lint sem erros nos arquivos novos.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/dev...HEAD`
Expected: só os arquivos da tabela "File Structure" (mais este plano). `TabelaLeitura.tsx` aparece como removido.

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo: resumo da Fase 2A; **migration 048 pendente de aplicação manual** (`supabase/migrations/048_planilhas_edicao.sql`, deve ser aplicada **antes** de testar edição); roteiro de teste manual: editar uma célula de cada tipo, digitar valor inválido (deve voltar ao anterior com erro), escolher cliente e ver o selo "sem cliente" sumir, adicionar e remover linha, paginar e usar "Só sem cliente", abrir a mesma tabela em duas abas e editar células diferentes da mesma linha; usuário de outro setor não vê a tabela. Fora do escopo: busca, filtro por coluna, ordenação, exportar, estrutura (Fase 2B). Sem merge.

- [ ] **Step 4: Avisar o usuário**

1) Aplicar `048_planilhas_edicao.sql` no Supabase de dev antes de testar. 2) Testar conforme o roteiro. 3) Lembrar que a migration 048 (e a 047) precisam ir a produção antes da promoção dev → main.
