# Minhas Tarefas: regimes que o usuário atende — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono de tipos de tarefa do Fiscal marca os regimes que atende; nas empresas de outros regimes a tarefa volta a ser do responsável da empresa.

**Architecture:** Uma tabela nova guarda os regimes por usuário. Duas funções puras (`donoAtendeRegime`, `donosNoRegime`) decidem, por cliente, se o tipo ainda tem dono. Cada ponto que hoje lê o dono do tipo (visibilidade, permissão de escrita, % de progresso, Minhas Tarefas) passa o mapa de donos por `donosNoRegime` com o regime do cliente antes de usar. Nenhuma função existente muda de comportamento quando não há regime marcado.

**Tech Stack:** Next.js 16 (app router, Server Actions), React 19, TypeScript, Supabase (Postgres + RLS), `node --test` + tsx.

**Spec:** `docs/superpowers/specs/2026-10-08-minhas-tarefas-regimes-design.md`

## Global Constraints

- Diretório de trabalho: `D:\DEV\Site Tesserato + Fiscal\wt-minhas-tarefas-regimes`, branch `feat/minhas-tarefas-regimes`. Nunca trabalhar na pasta `portal-tesserato`.
- `AGENTS.md`: este Next.js tem mudanças incompatíveis. Antes de escrever Server Action ou componente cliente, ler o guia correspondente em `node_modules/next/dist/docs/`.
- Só o setor Fiscal muda. `podeEditarTarefaTipoSocietario` e `podeEditarTarefaTipoFinanceiro` ficam intactos.
- Sem regime marcado (sem linha na tabela ou `regimes` vazio) o comportamento é idêntico ao de hoje.
- Comparação de regime sempre com `normalizarNome` (trim + minúsculas) de `lib/tarefa-tipo-visibilidade.ts`.
- Admin continua vendo e editando tudo.
- Migration: número `069`. Aplicar só no banco de dev. Produção não é tocada neste plano.
- Componentes visuais só de `components/ui`. Sem `text-[10px]`/`text-[11px]`, sem cores fixas, sem `alert`/`confirm`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não fazer push nem abrir PR antes da Task 7. Nunca fazer merge.

## Review Focus

1. Cliente sem regime quando o dono marcou regimes: a tarefa vai para o responsável da empresa (Task 1).
2. Regime com caixa ou espaços diferentes entre cadastro do cliente e marcação ("simples nacional " x "Simples Nacional"): deve bater (Task 1).
3. Tabela `minhas_tarefas_regimes` ausente ou consulta com erro: todas as telas se comportam como hoje, sem quebrar (Task 2).
4. Dono tenta gravar tarefa de cliente fora dos seus regimes chamando a action direto: recusado, a menos que seja o responsável da empresa (Task 3, conferência manual do código; a função depende de sessão e não tem teste automatizado).
5. Usuário comum tenta salvar regimes de outra pessoa: recusado pela action e pela RLS (Tasks 2 e 6).

---

### Task 1: Regra pura

**Files:**
- Modify: `lib/tarefa-tipo-visibilidade.ts` (acrescentar ao final)
- Test: `tests/dono-atende-regime.test.ts` (novo)

**Interfaces:**
- Consumes: `normalizarNome` (mesmo arquivo).
- Produces:
  - `donoAtendeRegime(regimesDoDono: readonly string[] | null | undefined, regimeCliente: string | null | undefined): boolean`
  - `donosNoRegime<T>(donoPorTipo: Record<string, T>, regimesPorTipo: Record<string, readonly string[] | undefined>, regimeCliente: string | null | undefined): Record<string, T>`
  - `regimesPorTipo` em todo o plano: mapa `nome do tipo -> regimes marcados pelo dono daquele tipo`. Tipo ausente do mapa = dono atende todos.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/dono-atende-regime.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { donoAtendeRegime, donosNoRegime, filtrarTiposDoProgresso } from '../lib/tarefa-tipo-visibilidade'

test('sem regime marcado o dono atende qualquer cliente', () => {
  assert.equal(donoAtendeRegime(undefined, 'Lucro Real'), true)
  assert.equal(donoAtendeRegime(null, null), true)
  assert.equal(donoAtendeRegime([], 'MEI'), true)
  assert.equal(donoAtendeRegime(['', '  '], 'MEI'), true)
})

test('regime marcado: atende só os clientes daquele regime', () => {
  assert.equal(donoAtendeRegime(['Simples Nacional', 'MEI'], 'MEI'), true)
  assert.equal(donoAtendeRegime(['Simples Nacional', 'MEI'], 'Lucro Real'), false)
})

test('caixa e espaços não importam', () => {
  assert.equal(donoAtendeRegime(['Simples Nacional'], ' simples nacional '), true)
})

test('cliente sem regime fica fora quando há regime marcado', () => {
  assert.equal(donoAtendeRegime(['MEI'], null), false)
  assert.equal(donoAtendeRegime(['MEI'], ''), false)
})

test('donosNoRegime tira do mapa o tipo cujo dono não atende o regime', () => {
  const donos = { DCTF: 'Bia', SPED: 'Caio', DAS: 'Bia' }
  const regimes = { DCTF: ['MEI'], DAS: ['MEI'] }
  assert.deepEqual(donosNoRegime(donos, regimes, 'Lucro Real'), { SPED: 'Caio' })
  assert.deepEqual(donosNoRegime(donos, regimes, 'MEI'), donos)
  assert.deepEqual(donosNoRegime(donos, {}, 'Lucro Real'), donos)
})

test('progresso: tipo volta a contar no cliente fora dos regimes do dono', () => {
  const donos = { DCTF: 'Bia' }
  const regimes = { DCTF: ['MEI'] }
  // Cliente da Ana, MEI: DCTF é da Bia, não conta.
  assert.deepEqual(filtrarTiposDoProgresso(['DCTF', 'DAS'], 'Ana', donosNoRegime(donos, regimes, 'MEI')), ['DAS'])
  // Cliente da Ana, Lucro Real: Bia não atende, DCTF conta para a Ana.
  assert.deepEqual(filtrarTiposDoProgresso(['DCTF', 'DAS'], 'Ana', donosNoRegime(donos, regimes, 'Lucro Real')), ['DCTF', 'DAS'])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/dono-atende-regime.test.ts`
Expected: FAIL, `donoAtendeRegime` não é exportado.

- [ ] **Step 3: Implementar** (ao final de `lib/tarefa-tipo-visibilidade.ts`)

```ts
// O dono de tipos de tarefa pode marcar os regimes que atende (Minhas Tarefas,
// tabela minhas_tarefas_regimes). Sem nada marcado ele atende todos os
// clientes, como sempre foi. Com regimes marcados, só os clientes desses
// regimes; nos demais (e nos sem regime) o tipo se comporta como tipo sem dono.
export function donoAtendeRegime(
  regimesDoDono: readonly string[] | null | undefined,
  regimeCliente: string | null | undefined,
): boolean {
  const marcados = (regimesDoDono ?? []).map(normalizarNome).filter(Boolean)
  if (marcados.length === 0) return true
  const regime = normalizarNome(regimeCliente)
  return regime !== '' && marcados.includes(regime)
}

// Recorta um mapa tipo -> dono (id ou nome) para UM cliente: sai o tipo cujo
// dono não atende o regime daquele cliente. `regimesPorTipo` é tipo -> regimes
// marcados pelo dono do tipo; tipo ausente = dono atende todos.
export function donosNoRegime<T>(
  donoPorTipo: Record<string, T>,
  regimesPorTipo: Record<string, readonly string[] | undefined>,
  regimeCliente: string | null | undefined,
): Record<string, T> {
  const saida: Record<string, T> = {}
  for (const [tipo, dono] of Object.entries(donoPorTipo)) {
    if (donoAtendeRegime(regimesPorTipo[tipo], regimeCliente)) saida[tipo] = dono
  }
  return saida
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/dono-atende-regime.test.ts`
Expected: 6 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tarefa-tipo-visibilidade.ts tests/dono-atende-regime.test.ts
git commit -m "feat(fiscal): regra de dono do tipo por regime do cliente"
```

---

### Task 2: Migration 069 e leitura dos regimes

**Files:**
- Create: `supabase/migrations/069_minhas_tarefas_regimes.sql`
- Modify: `lib/tarefa-tipo-donos.ts`
- Modify: `lib/tarefa-tipo-donos-actions.ts`
- Test: `tests/regimes-por-tipo.test.ts` (novo)

**Interfaces:**
- Produces:
  - Tabela `minhas_tarefas_regimes (user_id uuid, setor text, regimes text[], updated_at timestamptz)`, PK `(user_id, setor)`.
  - `montarRegimesPorTipo(tipos: { nome: string; responsavel_id: string | null }[], linhas: { user_id: string; regimes: string[] | null }[]): Record<string, string[]>` (pura).
  - `buscarRegimesPorTipo(supabase: SupabaseClient, setor: string): Promise<Record<string, string[]>>`.
  - `buscarRegimesPorTipoFiscal(): Promise<Record<string, string[]>>` (Server Action, para a tela de Relatórios, que é componente cliente).

- [ ] **Step 1: Conferir que o número 069 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -3 && gh pr list --state open --json number,title`
Expected: última migration é `068_...`; nenhuma PR aberta com `069`. Se houver, usar o próximo número livre e ajustar o nome do arquivo em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/069_minhas_tarefas_regimes.sql

-- Regimes que o dono de tipos de tarefa atende (Minhas Tarefas do Fiscal).
-- Uma linha por usuário e setor. Sem linha, ou com a lista vazia, o dono
-- atende todos os clientes, como sempre foi: a migration é aditiva.
-- Com regimes marcados, nos clientes de outros regimes o tipo se comporta como
-- tipo sem dono (ver lib/tarefa-tipo-visibilidade.ts:donoAtendeRegime).
-- Regime é guardado pelo nome, igual a clientes_fiscal.regime (sem FK).
begin;
set local lock_timeout = '5s';

create table if not exists public.minhas_tarefas_regimes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  setor      text not null,
  regimes    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, setor)
);

alter table public.minhas_tarefas_regimes enable row level security;

-- Leitura por qualquer autenticado: toda tela do Fiscal precisa saber os
-- regimes do dono de cada tipo para decidir o que mostrar a cada usuário.
create policy "Autenticados leem minhas_tarefas_regimes" on public.minhas_tarefas_regimes
  for select using (auth.uid() is not null);

create policy "Usuario grava os proprios regimes" on public.minhas_tarefas_regimes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Admin gerencia minhas_tarefas_regimes" on public.minhas_tarefas_regimes
  for all using (is_admin()) with check (is_admin());

commit;
```

- [ ] **Step 3: Escrever o teste que falha**

```ts
// tests/regimes-por-tipo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarRegimesPorTipo } from '../lib/tarefa-tipo-donos'

const tipos = [
  { nome: 'DCTF', responsavel_id: 'u1' },
  { nome: 'DAS', responsavel_id: 'u1' },
  { nome: 'SPED', responsavel_id: 'u2' },
  { nome: 'ICMS', responsavel_id: null },
]

test('cada tipo recebe os regimes marcados pelo seu dono', () => {
  const mapa = montarRegimesPorTipo(tipos, [{ user_id: 'u1', regimes: ['MEI', 'Simples Nacional'] }])
  assert.deepEqual(mapa, { DCTF: ['MEI', 'Simples Nacional'], DAS: ['MEI', 'Simples Nacional'] })
})

test('dono sem linha, com lista vazia ou nula fica fora do mapa', () => {
  assert.deepEqual(montarRegimesPorTipo(tipos, []), {})
  assert.deepEqual(montarRegimesPorTipo(tipos, [{ user_id: 'u1', regimes: [] }, { user_id: 'u2', regimes: null }]), {})
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `node --import tsx --test tests/regimes-por-tipo.test.ts`
Expected: FAIL, `montarRegimesPorTipo` não é exportado.

- [ ] **Step 5: Implementar a leitura** (ao final de `lib/tarefa-tipo-donos.ts`)

```ts
export function montarRegimesPorTipo(
  tipos: { nome: string; responsavel_id: string | null }[],
  linhas: { user_id: string; regimes: string[] | null }[],
): Record<string, string[]> {
  const porDono = new Map(linhas.map(l => [l.user_id, l.regimes ?? []]))
  const mapa: Record<string, string[]> = {}
  for (const t of tipos) {
    const regimes = t.responsavel_id ? porDono.get(t.responsavel_id) : undefined
    if (regimes && regimes.length > 0) mapa[t.nome] = regimes
  }
  return mapa
}

// tipo de tarefa do setor -> regimes que o dono daquele tipo marcou em Minhas
// Tarefas. Só entram tipos cujo dono marcou algum regime; usado com
// donosNoRegime (lib/tarefa-tipo-visibilidade.ts). A RLS deixa qualquer
// autenticado ler, então serve o client de sessão. Se a consulta falhar o mapa
// sai vazio e tudo se comporta como antes dos regimes existirem.
export async function buscarRegimesPorTipo(
  supabase: SupabaseClient,
  setor: string,
): Promise<Record<string, string[]>> {
  const [{ data: tipos }, { data: linhas }] = await Promise.all([
    supabase.from('tarefa_tipos').select('nome, responsavel_id').eq('setor', setor).not('responsavel_id', 'is', null),
    supabase.from('minhas_tarefas_regimes').select('user_id, regimes').eq('setor', setor),
  ])
  return montarRegimesPorTipo(
    (tipos ?? []) as { nome: string; responsavel_id: string | null }[],
    (linhas ?? []) as { user_id: string; regimes: string[] | null }[],
  )
}
```

Em `lib/tarefa-tipo-donos-actions.ts`, trocar o import e acrescentar ao final:

```ts
import { buscarDonoNomePorTipo, buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
```

```ts
export async function buscarRegimesPorTipoFiscal(): Promise<Record<string, string[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  return buscarRegimesPorTipo(supabase, 'fiscal')
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --import tsx --test tests/regimes-por-tipo.test.ts`
Expected: 2 testes PASS.

- [ ] **Step 7: Aplicar a migration no banco de dev** (feito pelo controlador da sessão, não por subagente)

Via `secrets_run` do Termbaker com o segredo `DEV_DATABASE_URL` e o `psql` 17 por caminho absoluto, rodando o arquivo `supabase/migrations/069_minhas_tarefas_regimes.sql`. Detalhes de conexão na memória `reference_dev_db_acesso_cofre` (senha com `@`, separar no último `@`). Antes de rodar, confirmar que a URL aponta para o projeto `fcpcorqquovvgtoukxry`.

Conferir:

```sql
select count(*) from public.minhas_tarefas_regimes;
select policyname, cmd from pg_policies where tablename = 'minhas_tarefas_regimes' order by 1;
```

Expected: `0` linhas; 3 policies.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/069_minhas_tarefas_regimes.sql lib/tarefa-tipo-donos.ts lib/tarefa-tipo-donos-actions.ts tests/regimes-por-tipo.test.ts
git commit -m "feat(fiscal): tabela e leitura dos regimes atendidos por dono de tipo (069)"
```

---

### Task 3: Permissão de escrita no servidor

**Files:**
- Modify: `lib/supabase/server.ts` (função `podeEditarTarefaTipo`, ~linhas 111-131)

**Interfaces:**
- Consumes: `donoAtendeRegime` (Task 1); tabela `minhas_tarefas_regimes` (Task 2).
- Produces: `podeEditarTarefaTipo(clienteId, tipo)` com a mesma assinatura.

- [ ] **Step 1: Importar a regra** no topo de `lib/supabase/server.ts`

```ts
import { donoAtendeRegime } from '@/lib/tarefa-tipo-visibilidade'
```

- [ ] **Step 2: Trocar o comentário e o corpo de `podeEditarTarefaTipo`**

Substituir a linha

```ts
  if (tarefaTipo?.responsavel_id) return tarefaTipo.responsavel_id === user.id
```

DENTRO de `podeEditarTarefaTipo` (não nas variantes Societário/Financeiro) por:

```ts
  if (tarefaTipo?.responsavel_id) {
    // O dono pode ter marcado os regimes que atende (Minhas Tarefas). Fora
    // deles o tipo é tarefa comum naquele cliente: vale podeEditarCliente.
    const [{ data: marcacao }, { data: clienteFiscal }] = await Promise.all([
      supabase.from('minhas_tarefas_regimes').select('regimes')
        .eq('user_id', tarefaTipo.responsavel_id).eq('setor', 'fiscal').maybeSingle(),
      supabase.from('clientes_fiscal').select('regime').eq('cliente_id', clienteId).maybeSingle(),
    ])
    if (donoAtendeRegime(marcacao?.regimes as string[] | null | undefined, clienteFiscal?.regime as string | null | undefined)) {
      return tarefaTipo.responsavel_id === user.id
    }
  }
```

No comentário acima da função, acrescentar ao final: `Se o dono marcou regimes e o cliente é de outro, o tipo volta a ser tarefa comum naquele cliente.`

- [ ] **Step 3: Conferir**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `git diff lib/supabase/server.ts`
Expected: só `podeEditarTarefaTipo` e o import mudaram; as funções `...Societario` e `...Financeiro` estão idênticas.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/server.ts
git commit -m "feat(fiscal): permissão de marcar tarefa respeita os regimes do dono do tipo"
```

---

### Task 4: Visibilidade na ficha, na listagem e na tela de Tarefas

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx` (~linhas 75-100)
- Modify: `app/fiscal/clientes/page.tsx` (~linhas 36-78)
- Modify: `app/fiscal/tarefas/page.tsx` (~linhas 35-78)

**Interfaces:**
- Consumes: `donoAtendeRegime`, `donosNoRegime` (Task 1); `buscarRegimesPorTipo(supabase, 'fiscal')` (Task 2).

- [ ] **Step 1: Ficha do cliente** (`app/fiscal/clientes/[id]/page.tsx`)

Imports:

```ts
import { tipoVisivelParaUsuario, donosNoRegime } from '@/lib/tarefa-tipo-visibilidade'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
```

Logo depois do laço que preenche `responsavelIdPorTipo`, acrescentar:

```ts
  // Dono do tipo NESTE cliente: sai o tipo cujo dono não atende o regime dele.
  const regimesPorTipo = await buscarRegimesPorTipo(supabase, 'fiscal')
  const donoIdNoCliente = donosNoRegime(responsavelIdPorTipo, regimesPorTipo, cliente.regime)
```

Trocar `responsavelIdPorTipo[tipo]` por `donoIdNoCliente[tipo]` nos três usos seguintes (`ehDonoOuAdmin` e as duas ocorrências dentro de `podeEditarPorTipo`). Resultado:

```ts
  const ehDonoOuAdmin = (tipo: string) =>
    tipoVisivelParaUsuario(donoIdNoCliente[tipo], user.id, profile?.role)

  const tarefasPersonalizadasVisiveis = tarefasPersonalizadasEfetivas.filter(ehDonoOuAdmin)

  const podeEditarPorTipo: Record<string, boolean> = {}
  for (const tipo of tarefasPersonalizadasVisiveis) {
    podeEditarPorTipo[tipo] = donoIdNoCliente[tipo]
      ? (profile?.role === 'admin' || donoIdNoCliente[tipo] === user.id)
      : podeEditar
  }
```

Conferir com `grep -n "responsavelIdPorTipo" "app/fiscal/clientes/[id]/page.tsx"` que sobraram só a declaração, o preenchimento e a chamada de `donosNoRegime`. Se `cliente.regime` não estiver disponível com esse nome nesse ponto do arquivo, usar a variável que a linha `{cliente.regime && <Badge ...>}` já usa.

- [ ] **Step 2: Listagem de clientes** (`app/fiscal/clientes/page.tsx`)

Imports:

```ts
import { tipoVisivelParaUsuario, filtrarTiposDoProgresso, donoAtendeRegime, donosNoRegime } from '@/lib/tarefa-tipo-visibilidade'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
```

Depois da linha `const donoNomePorTipo = await buscarDonoNomePorTipoFiscal()`:

```ts
  const regimesPorTipo = await buscarRegimesPorTipo(supabase, 'fiscal')
```

Dentro do laço `for (const c of clientes)`, trocar as duas linhas que montam `tipos` por:

```ts
    // Dono do tipo neste cliente: quem marcou regimes só é dono nos clientes deles.
    const tipos = filtrarTiposDoProgresso(new Set(tiposBase), c.responsavel, donosNoRegime(donoNomePorTipo, regimesPorTipo, c.regime))
      .filter(tipo => tipoVisivelParaUsuario(
        donoAtendeRegime(regimesPorTipo[tipo], c.regime) ? responsavelIdPorTipo.get(tipo) : null,
        user.id, profile?.role,
      ))
```

`c` já tem `regime` (é o mesmo objeto passado a `calcularTarefasEsperadas`).

- [ ] **Step 3: Tela de Tarefas** (`app/fiscal/tarefas/page.tsx`)

Imports:

```ts
import { tipoVisivelParaUsuario, tipoContaNoProgressoDoCliente, donoAtendeRegime } from '@/lib/tarefa-tipo-visibilidade'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
```

Trocar `tipoVisivel` para receber o regime e carregar os regimes:

```ts
  const regimesPorTipo = await buscarRegimesPorTipo(supabase, 'fiscal')
  // Dono só vale nos clientes dos regimes que ele marcou (Minhas Tarefas).
  const donoVale = (tipo: string, regime: string | null) => donoAtendeRegime(regimesPorTipo[tipo], regime)
  const tipoVisivel = (tipo: string, regime: string | null) =>
    tipoVisivelParaUsuario(donoVale(tipo, regime) ? responsavelIdPorTipo.get(tipo) : null, user.id, profile?.role)
```

Na consulta de clientes, incluir o regime: `clientes_fiscal!inner(cod, responsavel, regime)` e no tipo do `map`: `clientes_fiscal: { cod: string | null; responsavel: string | null; regime: string | null }`.

Na linha que monta `ts`:

```ts
    const ts = (tarefasPorCliente.get(cliente.id) ?? []).filter(t =>
      tipoVisivel(t.tipo, cliente.regime)
      && tipoContaNoProgressoDoCliente(donoVale(t.tipo, cliente.regime) ? donoNomePorTipo[t.tipo] : null, cliente.responsavel))
```

Rodar `grep -n "tipoVisivel(" app/fiscal/tarefas/page.tsx` e ajustar qualquer outra chamada para passar o regime do cliente correspondente.

- [ ] **Step 4: Conferir**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx" app/fiscal/clientes/page.tsx app/fiscal/tarefas/page.tsx
git commit -m "feat(fiscal): ficha, listagem e Tarefas mostram ao responsável a tarefa fora dos regimes do dono"
```

---

### Task 5: % de progresso (dashboard, relatórios, envio agendado)

**Files:**
- Modify: `lib/dashboard-meu.ts`
- Modify: `app/fiscal/dashboard/page.tsx` (~linhas 94-112)
- Modify: `lib/relatorio-fiscal.ts` (linhas 14-34)
- Modify: `lib/relatorio-fiscal-envio.ts` (~linhas 35-52)
- Modify: `app/fiscal/relatorios/page.tsx` (linhas 39-44, 61, 101, 112, 124-131)
- Test: `tests/dashboard-meu.test.ts` (acrescentar), `tests/progresso-tipos-encaminhados.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `donoAtendeRegime`, `donosNoRegime` (Task 1); `buscarRegimesPorTipo`, `buscarRegimesPorTipoFiscal` (Task 2).
- Produces:
  - `EntradaMeu` ganha `regimesPorTipo?: Record<string, string[]>`; `ClienteMin` ganha `regime?: string | null`.
  - `calcularProgresso(cliente, tarefas, mapaVinculos, donoNomePorTipo = {}, regimesPorTipo = {})` e `montarLinhasRelatorio(clientes, tarefas, mapaVinculos, donoNomePorTipo = {}, regimesPorTipo = {})`.

- [ ] **Step 1: Testes que falham**

Acrescentar ao final de `tests/dashboard-meu.test.ts` (usar o import de `calcularMeu` que o arquivo já tem):

```ts
test('encaminhadas respeitam os regimes que o dono marcou', () => {
  const clientes = [
    { id: 'c1', responsavel: 'Ana', regime: 'MEI' },
    { id: 'c2', responsavel: 'Ana', regime: 'Lucro Real' },
  ]
  const r = calcularMeu({
    clientes,
    nomeUsuario: 'Bia',
    tarefas: [],
    tiposDoProgresso: {},
    tiposBrutos: { c1: new Set(['DCTF']), c2: new Set(['DCTF']) },
    donoNomePorTipo: { DCTF: 'Bia' },
    regimesPorTipo: { DCTF: ['MEI'] },
  })
  assert.deepEqual(r.encaminhadas.map(e => e.cliente.id), ['c1'])
})

test('sem regimesPorTipo as encaminhadas ficam como antes', () => {
  const r = calcularMeu({
    clientes: [{ id: 'c2', responsavel: 'Ana', regime: 'Lucro Real' }],
    nomeUsuario: 'Bia',
    tarefas: [],
    tiposDoProgresso: {},
    tiposBrutos: { c2: new Set(['DCTF']) },
    donoNomePorTipo: { DCTF: 'Bia' },
  })
  assert.equal(r.encaminhadas.length, 1)
})
```

Acrescentar ao final de `tests/progresso-tipos-encaminhados.test.ts`:

```ts
import { donosNoRegime } from '../lib/tarefa-tipo-visibilidade'

test('tipo com dono conta no cliente fora dos regimes do dono', () => {
  const donos = donosNoRegime({ DCTF: 'Bia' }, { DCTF: ['MEI'] }, 'Lucro Real')
  assert.deepEqual(filtrarTiposDoProgresso(['DCTF'], 'Ana', donos), ['DCTF'])
})
```

(Mover o `import` para o topo do arquivo, junto do import existente.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/dashboard-meu.test.ts tests/progresso-tipos-encaminhados.test.ts`
Expected: o teste "encaminhadas respeitam os regimes" FALHA (retorna `['c1','c2']`); os demais passam.

- [ ] **Step 3: `lib/dashboard-meu.ts`**

Import:

```ts
import { normalizarNome, donoAtendeRegime } from './tarefa-tipo-visibilidade'
```

`ClienteMin` e `EntradaMeu`:

```ts
interface ClienteMin { id: string; responsavel: string | null; regime?: string | null }
```

```ts
  donoNomePorTipo: Record<string, string | null | undefined>
  /** Regimes marcados pelo dono de cada tipo; tipo ausente = dono atende todos. */
  regimesPorTipo?: Record<string, string[]>
```

No laço das encaminhadas, trocar o `.filter`:

```ts
      .filter(tipo => mesmoResponsavel(e.donoNomePorTipo[tipo], e.nomeUsuario)
        && donoAtendeRegime(e.regimesPorTipo?.[tipo], c.regime))
```

- [ ] **Step 4: `app/fiscal/dashboard/page.tsx`**

Imports:

```ts
import { filtrarTiposDoProgresso, donosNoRegime } from '@/lib/tarefa-tipo-visibilidade'
import { buscarRegimesPorTipo } from '@/lib/tarefa-tipo-donos'
```

Depois de `const donoNomePorTipo = await buscarDonoNomePorTipoFiscal()`:

```ts
  const regimesPorTipo = await buscarRegimesPorTipo(supabase, 'fiscal')
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTiposDoProgresso(tiposMap[c.id], c.responsavel, donosNoRegime(donoNomePorTipo, regimesPorTipo, c.regime)))
  }
```

(substitui o laço `for (const c of cs)` que vinha logo abaixo). Na chamada de `calcularMeu`, acrescentar `regimesPorTipo` ao objeto. Se o client Supabase da página tiver outro nome que não `supabase`, usar o nome real.

- [ ] **Step 5: `lib/relatorio-fiscal.ts`**

Import: `import { filtrarTiposDoProgresso, donosNoRegime } from './tarefa-tipo-visibilidade'`

```ts
export function calcularProgresso(cliente: ClienteComFiscal, tarefas: Tarefa[], mapaVinculos: MapaVinculosSetor, donoNomePorTipo: Record<string, string> = {}, regimesPorTipo: Record<string, string[]> = {}): ProgressoCliente {
  const tipos = new Set(filtrarTiposDoProgresso(calcularTarefasEsperadas(cliente, mapaVinculos), cliente.responsavel, donosNoRegime(donoNomePorTipo, regimesPorTipo, cliente.regime)))
```

```ts
export function montarLinhasRelatorio(clientes: ClienteComFiscal[], tarefas: Tarefa[], mapaVinculos: MapaVinculosSetor, donoNomePorTipo: Record<string, string> = {}, regimesPorTipo: Record<string, string[]> = {}): LinhaRelatorio[] {
```

e, dentro dela, passar `regimesPorTipo` como 5º argumento de `calcularProgresso`.

- [ ] **Step 6: `lib/relatorio-fiscal-envio.ts`**

Import: `import { buscarDonoNomePorTipo, buscarRegimesPorTipo } from './tarefa-tipo-donos'`

No `Promise.all`, acrescentar um quinto item `buscarRegimesPorTipo(admin, 'fiscal')` e o nome `regimesPorTipo` na desestruturação. Na chamada de `montarLinhasRelatorio`, passar `regimesPorTipo` como 5º argumento.

- [ ] **Step 7: `app/fiscal/relatorios/page.tsx`**

Imports:

```ts
import { buscarDonoNomePorTipoFiscal, buscarRegimesPorTipoFiscal } from '@/lib/tarefa-tipo-donos-actions'
import { filtrarTiposDoProgresso, donosNoRegime } from '@/lib/tarefa-tipo-visibilidade'
```

`tiposDoCliente` e `progresso` ganham o parâmetro `regimes: Record<string, string[]>` depois de `donos`; em `tiposDoCliente`:

```ts
  return filtrarTiposDoProgresso(calcularTarefasEsperadas(cliente, mapa), cliente.responsavel, donosNoRegime(donos, regimes, cliente.regime))
```

`progresso` repassa `regimes` para `tiposDoCliente` (ou para `calcularProgresso`, conforme o que o corpo dela chamar hoje).

Estado: `const [regimesPorTipo, setRegimesPorTipo] = useState<Record<string, string[]>>({})`.

No `Promise.all` que já chama `buscarDonoNomePorTipoFiscal()`, acrescentar `buscarRegimesPorTipoFiscal()` como último item, desestruturar o resultado e chamar `setRegimesPorTipo(...)` ao lado de `setDonoNomePorTipo(donos)`.

Passar `regimesPorTipo` em todas as chamadas de `tiposDoCliente(...)` e `progresso(...)` (linhas ~124, ~130, ~131). Conferir com `grep -n "tiposDoCliente(\|progresso(" app/fiscal/relatorios/page.tsx` que nenhuma ficou com a aridade antiga.

- [ ] **Step 8: Rodar tudo**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros de tipo/lint; todos os testes PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard-meu.ts app/fiscal/dashboard/page.tsx lib/relatorio-fiscal.ts lib/relatorio-fiscal-envio.ts app/fiscal/relatorios/page.tsx tests/dashboard-meu.test.ts tests/progresso-tipos-encaminhados.test.ts
git commit -m "feat(fiscal): % de progresso e relatórios respeitam os regimes do dono do tipo"
```

---

### Task 6: Campo "Regimes que atendo" e filtro em Minhas Tarefas

**Files:**
- Create: `lib/minhas-tarefas-regimes.ts` (funções puras)
- Create: `lib/minhas-tarefas-regimes-actions.ts` (Server Action)
- Create: `components/fiscal/MinhasTarefasRegimes.tsx`
- Modify: `app/fiscal/minhas-tarefas/page.tsx`
- Test: `tests/minhas-tarefas-regimes.test.ts` (novo)

**Interfaces:**
- Consumes: `donoAtendeRegime`, `normalizarNome` (Task 1); tabela `minhas_tarefas_regimes` (Task 2); `Chip` de `components/ui/Chip`.
- Produces:
  - `limparRegimes(regimes: unknown): string[]`
  - `opcoesDeRegime(catalogo: string[], marcados: string[]): { nome: string; marcado: boolean; foraDoCatalogo: boolean }[]`
  - `salvarRegimesMinhasTarefas(userId: string, regimes: string[]): Promise<{ error: string | null }>`
  - `<MinhasTarefasRegimes userId catalogo marcados />`

- [ ] **Step 1: Teste que falha**

```ts
// tests/minhas-tarefas-regimes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limparRegimes, opcoesDeRegime } from '../lib/minhas-tarefas-regimes'

test('limparRegimes tira vazios, espaços e repetidos (sem olhar caixa)', () => {
  assert.deepEqual(limparRegimes([' MEI ', 'mei', '', '  ', 'Lucro Real']), ['MEI', 'Lucro Real'])
})

test('limparRegimes devolve lista vazia para entrada que não é lista de textos', () => {
  assert.deepEqual(limparRegimes(null), [])
  assert.deepEqual(limparRegimes('MEI'), [])
  assert.deepEqual(limparRegimes([1, null, 'MEI']), ['MEI'])
})

test('opcoesDeRegime marca os do catálogo e mostra o marcado que saiu dele', () => {
  assert.deepEqual(opcoesDeRegime(['Lucro Real', 'MEI'], ['mei', 'Antigo']), [
    { nome: 'Lucro Real', marcado: false, foraDoCatalogo: false },
    { nome: 'MEI', marcado: true, foraDoCatalogo: false },
    { nome: 'Antigo', marcado: true, foraDoCatalogo: true },
  ])
})

test('componente e página: sem fontes pequenas, cores fixas nem alert/confirm', () => {
  for (const arq of ['components/fiscal/MinhasTarefasRegimes.tsx', 'app/fiscal/minhas-tarefas/page.tsx']) {
    const src = readFileSync(join(process.cwd(), arq), 'utf-8')
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/)
    assert.doesNotMatch(src, /\b(alert|confirm)\(/)
  }
})

test('página filtra as seções pelo regime e deixa Eventos com todos os clientes', () => {
  const src = readFileSync(join(process.cwd(), 'app/fiscal/minhas-tarefas/page.tsx'), 'utf-8')
  assert.match(src, /donoAtendeRegime\(regimesAlvo, c\.regime\)/)
  assert.match(src, /clientes=\{clientesTodos\}/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/minhas-tarefas-regimes.test.ts`
Expected: FAIL, módulo `lib/minhas-tarefas-regimes` não existe.

- [ ] **Step 3: Funções puras** (`lib/minhas-tarefas-regimes.ts`)

```ts
import { normalizarNome } from './tarefa-tipo-visibilidade'

// Regimes que o usuário marcou em Minhas Tarefas (tabela minhas_tarefas_regimes).
// Entrada vem de Server Action, então não confia no tipo: fica só texto não
// vazio, sem espaços nas pontas e sem repetição (comparando sem caixa).
export function limparRegimes(regimes: unknown): string[] {
  if (!Array.isArray(regimes)) return []
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const r of regimes) {
    if (typeof r !== 'string') continue
    const chave = normalizarNome(r)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(r.trim())
  }
  return saida
}

export interface OpcaoRegime { nome: string; marcado: boolean; foraDoCatalogo: boolean }

// Opções do campo "Regimes que atendo": o catálogo do setor na ordem dele e,
// depois, o que está marcado mas saiu do catálogo (renomeado ou desativado),
// para o usuário conseguir desmarcar.
export function opcoesDeRegime(catalogo: string[], marcados: string[]): OpcaoRegime[] {
  const chavesMarcadas = new Set(marcados.map(normalizarNome))
  const chavesCatalogo = new Set(catalogo.map(normalizarNome))
  return [
    ...catalogo.map(nome => ({ nome, marcado: chavesMarcadas.has(normalizarNome(nome)), foraDoCatalogo: false })),
    ...marcados
      .filter(nome => !chavesCatalogo.has(normalizarNome(nome)))
      .map(nome => ({ nome, marcado: true, foraDoCatalogo: true })),
  ]
}
```

- [ ] **Step 4: Server Action** (`lib/minhas-tarefas-regimes-actions.ts`)

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { limparRegimes } from '@/lib/minhas-tarefas-regimes'

// Grava os regimes que o usuário atende em Minhas Tarefas do Fiscal. Cada um
// grava a própria linha; admin grava a de qualquer usuário (a RLS da tabela
// repete a mesma regra). Lista vazia = atende todos os regimes.
export async function salvarRegimesMinhasTarefas(
  userId: string,
  regimes: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Entre de novo.' }
  if (typeof userId !== 'string' || !userId) return { error: 'Usuário inválido.' }

  if (userId !== user.id) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return { error: 'Sem permissão para alterar os regimes de outro usuário.' }
  }

  const { error } = await supabase.from('minhas_tarefas_regimes').upsert(
    { user_id: userId, setor: 'fiscal', regimes: limparRegimes(regimes), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,setor' },
  )
  if (error) return { error: error.message }

  // Muda quem vê e marca a tarefa em todo o Fiscal (ficha, listagem, Tarefas, dashboard).
  revalidatePath('/fiscal', 'layout')
  return { error: null }
}
```

Antes de escrever, conferir em `node_modules/next/dist/docs/` que `revalidatePath(caminho, 'layout')` continua com essa assinatura nesta versão; se mudou, usar a forma atual.

- [ ] **Step 5: Componente** (`components/fiscal/MinhasTarefasRegimes.tsx`)

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip } from '@/components/ui/Chip'
import { Aviso } from '@/components/ui/Aviso'
import { opcoesDeRegime } from '@/lib/minhas-tarefas-regimes'
import { salvarRegimesMinhasTarefas } from '@/lib/minhas-tarefas-regimes-actions'

interface Props {
  userId: string
  catalogo: string[]
  marcados: string[]
}

// Regimes que o dono dos tipos atende. Nada marcado = todos. Fora dos
// marcados, a tarefa volta para o responsável de cada empresa.
export default function MinhasTarefasRegimes({ userId, catalogo, marcados }: Props) {
  const router = useRouter()
  const [selecionados, setSelecionados] = useState(marcados)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const opcoes = opcoesDeRegime(catalogo, selecionados)

  function alternar(nome: string, marcado: boolean) {
    const anterior = selecionados
    const proximo = marcado
      ? selecionados.filter(r => r.trim().toLowerCase() !== nome.trim().toLowerCase())
      : [...selecionados, nome]
    setSelecionados(proximo)
    setErro(null)
    iniciar(async () => {
      const { error } = await salvarRegimesMinhasTarefas(userId, proximo)
      if (error) {
        setSelecionados(anterior)
        setErro(error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section aria-label="Regimes que atendo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-medium text-fg">Regimes que atendo</h2>
        <p className="text-[13px] text-fg-2">
          {selecionados.length === 0
            ? 'Todos os regimes. Marque para ver só as empresas desses regimes.'
            : 'Nas empresas dos outros regimes a tarefa fica com o responsável da empresa.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(o => (
          <Chip key={o.nome} ativo={o.marcado} disabled={salvando} onClick={() => alternar(o.nome, o.marcado)}>
            {o.nome}{o.foraDoCatalogo ? ' (fora do catálogo)' : ''}
          </Chip>
        ))}
      </div>
      {erro && <Aviso tom="dng">Não foi possível salvar: {erro}</Aviso>}
    </section>
  )
}
```

Conferir em `components/ui/Aviso.tsx` o nome exato do tom de erro e em outro componente de `components/fiscal` as classes de texto usadas para título e texto secundário (`text-fg`, `text-fg-2`); usar os nomes reais do projeto.

- [ ] **Step 6: Página** (`app/fiscal/minhas-tarefas/page.tsx`)

Imports:

```ts
import MinhasTarefasRegimes from '@/components/fiscal/MinhasTarefasRegimes'
import { donoAtendeRegime } from '@/lib/tarefa-tipo-visibilidade'
```

No `Promise.all` que busca `clientesRaw`, `mapaVinculos`, `dossieRaw` e `catalogo`, acrescentar um quinto item e desestruturar como `{ data: marcacaoRaw }`:

```ts
    supabase.from('minhas_tarefas_regimes').select('regimes')
      .eq('user_id', targetUserId).eq('setor', 'fiscal').maybeSingle(),
```

Logo depois:

```ts
  const regimesAlvo = ((marcacaoRaw?.regimes ?? []) as string[])
```

No `map` de `clientesTodos`, incluir o regime no objeto retornado:

```ts
    return { id: r.id, nome: r.nome, atividade: r.clientes_fiscal.atividade ?? [], regime: r.clientes_fiscal.regime, esperadas }
```

No `secoes` passado a `MinhasTarefasFiltro`, trocar a linha de `clientes`:

```ts
              clientes: clientesTodos.filter(c => c.esperadas.includes(tipoInfo.nome) && donoAtendeRegime(regimesAlvo, c.regime)),
```

`EventosConsolidados` continua recebendo `clientes={clientesTodos}` e `DossieSecao` não muda.

No JSX, logo antes de `<MinhasTarefasTabs`, depois do `Aviso` de somente leitura:

```tsx
      <MinhasTarefasRegimes
        key={targetUserId}
        userId={targetUserId}
        catalogo={catalogo.regimes}
        marcados={regimesAlvo}
      />
```

O campo fica editável também quando o admin vê outro usuário (`somenteLeitura`): a action aceita admin gravando a linha de outra pessoa. O `key` reinicia o estado ao trocar de usuário no seletor.

- [ ] **Step 7: Rodar tudo**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; todos os testes PASS, incluindo `tests/fase4b-minhas-tarefas.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add lib/minhas-tarefas-regimes.ts lib/minhas-tarefas-regimes-actions.ts components/fiscal/MinhasTarefasRegimes.tsx app/fiscal/minhas-tarefas/page.tsx tests/minhas-tarefas-regimes.test.ts
git commit -m "feat(fiscal): usuário marca os regimes que atende em Minhas Tarefas"
```

---

### Task 7: Verificação final e PR (controlador da sessão)

**Files:**
- Modify: `CHANGELOG.md` (entrada no topo, no formato das entradas existentes)

- [ ] **Step 1: Varredura de pontos esquecidos**

Run: `git grep -n "responsavel_id\|donoNomePorTipo\|tipoVisivelParaUsuario" -- app/fiscal lib components/fiscal`
Expected: todo uso no Fiscal que decide visibilidade, permissão ou progresso por cliente passa por `donoAtendeRegime` ou `donosNoRegime`. Ficam de fora, de propósito: o seletor de usuários do admin e a busca de `meusTipos` em Minhas Tarefas, `lib/dossie-actions.ts` (só confere se o usuário tem algum tipo) e `lib/tarefa-tipo-vinculos-actions.ts` (Configurações). Qualquer outro ponto encontrado é corrigido aqui, antes da PR.

- [ ] **Step 2: Suíte completa**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tudo sem erro.

- [ ] **Step 3: Conferir a RLS no dev**

Com `secrets_run` + `DEV_DATABASE_URL`: confirmar que as 3 policies existem e que a tabela está com RLS ligada (`select relrowsecurity from pg_class where relname = 'minhas_tarefas_regimes'` → `t`).

- [ ] **Step 4: CHANGELOG, commit, push e PR contra `dev`**

Entrada no `CHANGELOG.md`, commit, `git push -u origin feat/minhas-tarefas-regimes` e `gh pr create --base dev`. O corpo da PR lista: o que muda para o usuário, a migration 069 (aplicada só no dev), o roteiro de teste abaixo e termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Não fazer merge.

Roteiro de teste para o corpo da PR:
1. Entrar como dono de um tipo de tarefa do Fiscal, abrir Minhas Tarefas e marcar um regime: só as empresas desse regime ficam nas seções.
2. Entrar como responsável de uma empresa de outro regime: a tarefa aparece na ficha, dá para marcar e ela entra na % da empresa.
3. Entrar como responsável de uma empresa do regime marcado: a tarefa continua não aparecendo.
4. Desmarcar tudo: volta ao comportamento de antes.
5. Como admin, abrir Minhas Tarefas de outro usuário e alterar os regimes dele.

- [ ] **Step 5: Atualizar o mapa do projeto e a memória**

`blueprint_update` no nó de Minhas Tarefas / Fiscal com os arquivos novos; memória do projeto com o estado da PR e a 069 pendente em produção.
