# Tabelas de planilha — Fase 2B (consulta e exportar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na página de uma tabela, permitir buscar em todas as colunas, filtrar por coluna, ordenar clicando no cabeçalho e exportar para Excel respeitando a consulta ativa.

**Architecture:** Toda a consulta (busca + filtros + ordenação + paginação) roda no banco numa função SQL `consultar_planilha_linhas` (SECURITY INVOKER, então a RLS por setor continua valendo com o cliente do usuário). O estado da consulta vive na URL (`q`, `filtros`, `ordem`, `dir`, `semCliente`, `pagina`), é validado por funções puras em `lib/tabelas/consulta.ts` e reaproveitado pela página e pela rota de exportação (`GET /api/tabelas/[id]/exportar`).

**Tech Stack:** Next.js 16 (App Router, Server Components, Route Handlers), React 19, Supabase (Postgres + RLS), `xlsx` (já é dependência), Tailwind v4, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-25-tabelas-de-planilha-design.md` (seção "Fase 2 — Visualização e edição"). **Divisão:** a Fase 2 do spec virou 2A (edição, já em `dev`), **2B (este plano: busca, filtro por coluna, ordenação, exportar)** e 2C (estrutura: adicionar/renomear/reordenar/excluir coluna, trocar tipo, excluir tabela; próximo plano). Também entra aqui o "cabeçalho fixo" do spec.

## Global Constraints

- **Next.js diferente do treinamento:** antes de escrever a rota de exportação e os componentes, ler o guia relevante em `node_modules/next/dist/docs/01-app/` (AGENTS.md do repo). `params` e `searchParams` são `Promise<...>`; em Route Handlers `params` também é `Promise` (ver `app/api/arquivos/[tabela]/[id]/route.ts`, que já existe).
- Setores de tabela: `fiscal`, `contabil`, `pessoal`, `societario`, `financeiro`. Tipos de coluna: `texto`, `numero`, `data`, `opcoes`, `cliente`.
- Valores das células ficam em `dados` por **id da coluna (uuid)**.
- A leitura usa o cliente **do usuário** (RLS por setor), nunca service role: quem não é do setor não vê nem exporta.
- Migration `049` e o teste SQL de fumaça são aplicados/rodados **manualmente pelo usuário no dev** (nunca contra produção). Toda PR mira `dev`; nunca fazer merge.
- Libs puras usam imports **relativos**; componentes/app usam `@/`.
- `npx tsc --noEmit` type-checa também os testes e tem de ficar limpo (`node --test` NÃO checa tipos).
- Busca é **sem distinção de maiúsculas** mas **com acento** (`jose` não acha `José`); é limitação conhecida e documentada (a extensão `unaccent` não é garantida no Supabase).
- Texto de UI em português. Trabalhar no worktree isolado a partir de `origin/dev`.

## Review Focus

1. **A busca deve casar VALORES, não as chaves do JSON** (as chaves são uuids: digitar `ab` não pode achar todas as linhas), e `%`, `_` e `\` digitados são literais. *(Task 1, teste de fumaça)*
2. **Filtro/ordenação numérica com valor legado não numérico** (Fase 1 guarda texto que não converteu, ex.: `abc` numa coluna de número) não pode derrubar a consulta com erro de cast; esses valores ficam de fora do filtro e vão para o fim da ordenação. *(Task 1, teste de fumaça)*
3. **Parâmetros da URL adulterados ou corrompidos** (`filtros` com JSON inválido, ids de coluna inexistentes, textos enormes, `ordem` que não é coluna): ignorados, nunca erro 500. *(Task 2)*
4. **Exportar respeita a mesma consulta** da tela (busca, filtros, ordenação, sem cliente), gera números e datas reais no Excel, com nome de aba e de arquivo seguros; quem não pode ler a tabela recebe 404. *(Tasks 3 e 4)*
5. **Página fora do intervalo após filtrar** (o total encolhe): a página é limitada à última válida; resultado vazio mostra mensagem clara, não tabela em branco. *(Task 5)*
6. **A migration 049 ainda não aplicada** não pode derrubar a página com erro cru: mostrar mensagem amigável. *(Task 5)*

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/049_planilhas_consulta.sql` | Função `consultar_planilha_linhas` |
| `supabase/tests/049_consultar_planilha_smoke.sql` | Teste de fumaça em SQL (roda no dev, faz rollback) |
| `lib/tabelas/consulta.ts` | Tipos e funções puras: `parseConsulta`, `serializeConsulta`, `toRpcFiltros`, `alternarOrdem`, `temConsultaAtiva` |
| `lib/tabelas/consultar.ts` | `parametrosRpc` (puro) e `consultarLinhas` (chama a função SQL) |
| `lib/tabelas/exportar-xlsx.ts` | `montarXlsx`, `nomeAbaSeguro`, `nomeArquivoSeguro` |
| `app/api/tabelas/[id]/exportar/route.ts` | Download `.xlsx` da consulta ativa |
| `components/tabelas/BarraConsulta.tsx` | Client: busca, painel de filtros, exportar |
| `components/tabelas/TabelaDetalhe.tsx` | Passa a usar a consulta (RPC) |
| `components/tabelas/TabelaEditavel.tsx` | Cabeçalho clicável (ordenar) e fixo |
| `app/<setor>/tabelas/[id]/page.tsx` (×5) | Repassam todos os `searchParams` |

---

### Task 1: Migration 049 e teste SQL de fumaça

**Files:**
- Create: `supabase/migrations/049_planilhas_consulta.sql`
- Create: `supabase/tests/049_consultar_planilha_smoke.sql`

**Interfaces:**
- Produces: `consultar_planilha_linhas(p_planilha uuid, p_busca text, p_filtros jsonb, p_sem_cliente boolean, p_ordem_coluna uuid, p_ordem_tipo text, p_ordem_desc boolean, p_offset integer, p_limit integer) returns table (id uuid, dados jsonb, cliente_id uuid, ordem integer, total bigint)`. `SECURITY INVOKER`, `stable`, executável por `authenticated`. `p_filtros` é um array JSON de objetos `{ "coluna": uuid, "tipo": "texto|cliente|opcoes|numero|data", "v": text, "min": numero, "max": numero, "de": "AAAA-MM-DD", "ate": "AAAA-MM-DD" }` (campos ausentes = sem limite). `total` = linhas que casam com a consulta (antes do offset/limit), repetido em cada linha. `p_limit` é limitado a 1000.

- [ ] **Step 1: Confirmar que o número 049 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -2 && gh pr list --state open --json headRefName`
Expected: última migration `048_planilhas_edicao.sql`; nenhum PR aberto com migration `049`. Se houver, usar o próximo número livre em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/049_planilhas_consulta.sql
--
-- Consulta de linhas de uma tabela de planilha: busca em todas as colunas,
-- filtros por coluna, ordenação e paginação, tudo no banco.
--
-- SECURITY INVOKER de propósito: a função lê planilha_linhas com a identidade
-- de quem chama, então a RLS por setor (migration 047) continua valendo e um
-- usuário de outro setor recebe zero linhas.
--
-- Cuidados:
--  * A busca compara os VALORES (jsonb_each_text), nunca as chaves (uuids).
--  * %, _ e \ digitados pelo usuário são literais (escapados para o ILIKE).
--  * Todo cast para numeric fica dentro de CASE guardado por regex: o SQL não
--    garante ordem de avaliação de AND, mas garante a de CASE. Valores legados
--    que a importação manteve como texto (ex.: 'abc' numa coluna de número)
--    ficam de fora do filtro numérico e vão para o fim da ordenação, sem erro.
--  * Datas são comparadas como texto ISO (AAAA-MM-DD ordena certo).

create or replace function consultar_planilha_linhas(
  p_planilha uuid,
  p_busca text,
  p_filtros jsonb,
  p_sem_cliente boolean,
  p_ordem_coluna uuid,
  p_ordem_tipo text,
  p_ordem_desc boolean,
  p_offset integer,
  p_limit integer
)
returns table (id uuid, dados jsonb, cliente_id uuid, ordem integer, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_busca, '')), '') as busca,
      p_ordem_coluna::text as col,
      coalesce(p_ordem_desc, false) as desc_
  )
  select l.id, l.dados, l.cliente_id, l.ordem, count(*) over () as total
  from planilha_linhas l
  cross join params pr
  where l.planilha_id = p_planilha
    and (p_sem_cliente is not true or l.cliente_id is null)
    and (
      pr.busca is null
      or exists (
        select 1
        from jsonb_each_text(l.dados) e
        where e.value ilike
          '%' || replace(replace(replace(pr.busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) f
      where not (
        case f->>'tipo'
          when 'texto' then
            coalesce(l.dados ->> (f->>'coluna'), '') ilike
              '%' || replace(replace(replace(coalesce(f->>'v', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          when 'cliente' then
            coalesce(l.dados ->> (f->>'coluna'), '') ilike
              '%' || replace(replace(replace(coalesce(f->>'v', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          when 'opcoes' then
            coalesce(l.dados ->> (f->>'coluna') = f->>'v', false)
          when 'numero' then
            coalesce(
              case when (l.dados ->> (f->>'coluna')) ~ '^-?[0-9]+(\.[0-9]+)?$' then
                ((f->>'min') is null or (l.dados ->> (f->>'coluna'))::numeric >= (f->>'min')::numeric)
                and ((f->>'max') is null or (l.dados ->> (f->>'coluna'))::numeric <= (f->>'max')::numeric)
              end,
              false)
          when 'data' then
            coalesce(
              case when (l.dados ->> (f->>'coluna')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
                ((f->>'de') is null or (l.dados ->> (f->>'coluna')) >= (f->>'de'))
                and ((f->>'ate') is null or (l.dados ->> (f->>'coluna')) <= (f->>'ate'))
              end,
              false)
          else true
        end
      )
    )
  order by
    case when p_ordem_coluna is not null and p_ordem_tipo = 'numero' and not pr.desc_
              and (l.dados ->> pr.col) ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (l.dados ->> pr.col)::numeric end asc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo = 'numero' and pr.desc_
              and (l.dados ->> pr.col) ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (l.dados ->> pr.col)::numeric end desc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo is distinct from 'numero' and not pr.desc_
         then lower(nullif(l.dados ->> pr.col, '')) end asc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo is distinct from 'numero' and pr.desc_
         then lower(nullif(l.dados ->> pr.col, '')) end desc nulls last,
    l.ordem,
    l.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 0), 1000)
$$;

revoke all on function consultar_planilha_linhas(uuid, text, jsonb, boolean, uuid, text, boolean, integer, integer) from public, anon;
grant execute on function consultar_planilha_linhas(uuid, text, jsonb, boolean, uuid, text, boolean, integer, integer) to authenticated;
```

- [ ] **Step 3: Escrever o teste de fumaça em SQL**

O ambiente do agente não tem banco; este arquivo é para o **usuário** colar no SQL Editor do Supabase de **dev**. Ele cria dados de teste dentro de uma transação, roda asserts sobre a função e faz `rollback` (nada fica no banco).

```sql
-- supabase/tests/049_consultar_planilha_smoke.sql
--
-- Teste de fumaça de consultar_planilha_linhas. Rodar SÓ no dev, no SQL Editor.
-- Cria uma tabela de teste, roda asserts e desfaz tudo (rollback).
-- Sucesso = aparece a mensagem "049 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  c_nome uuid := gen_random_uuid();
  c_num  uuid := gen_random_uuid();
  c_data uuid := gen_random_uuid();
  c_st   uuid := gen_random_uuid();
  r text[];
  n bigint;
begin
  insert into planilhas (id, setor, nome) values (v_pl, 'fiscal', 'smoke 049');
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_nome, v_pl, 'Nome',   'texto',  0, null),
    (c_num,  v_pl, 'Valor',  'numero', 1, null),
    (c_data, v_pl, 'Data',   'data',   2, null),
    (c_st,   v_pl, 'Status', 'opcoes', 3, '[{"valor":"Feito","cor":"#10b981"},{"valor":"Pendente","cor":"#f59e0b"}]'::jsonb);

  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 0, jsonb_build_object(c_nome::text, 'Padaria São José',   c_num::text, 10,    c_data::text, '2026-03-15', c_st::text, 'Feito')),
    (v_pl, 1, jsonb_build_object(c_nome::text, 'Mercado 100% Bom',   c_num::text, 9,     c_data::text, '2026-04-01', c_st::text, 'Pendente')),
    (v_pl, 2, jsonb_build_object(c_nome::text, 'Oficina_do João',    c_num::text, 100,   c_data::text, '2025-12-31', c_st::text, 'Feito')),
    (v_pl, 3, jsonb_build_object(c_nome::text, 'sem numero',         c_num::text, 'abc', c_data::text, 'ontem')),
    (v_pl, 4, '{}'::jsonb);

  -- 1) sem filtros: total 5
  select total into n from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 0, 100) limit 1;
  assert n = 5, 'total sem filtros deveria ser 5, veio ' || coalesce(n::text, 'null');

  -- 2) busca por valor
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, 'padaria', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'busca padaria: ' || r::text;

  -- 3) busca NÃO casa chaves (uuid): os 8 primeiros caracteres do id da coluna só existem nas chaves
  select array(select l.id::text from consultar_planilha_linhas(v_pl, left(c_nome::text, 8), '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert coalesce(array_length(r, 1), 0) = 0, 'busca casou chave do JSON: ' || r::text;

  -- 4) % e _ são literais
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, '100%', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom'], 'busca 100%: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, '_do', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Oficina_do João'], 'busca _do: ' || r::text;

  -- 5) filtro numérico: min 10 -> 10 e 100 (o 'abc' legado e o vazio ficam de fora, sem erro)
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_num, 'tipo', 'numero', 'min', 10)), false, null, null, false, 0, 100) l order by 1) into r;
  assert r = array['Oficina_do João', 'Padaria São José'], 'numero min 10: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_num, 'tipo', 'numero', 'max', 9)), false, null, null, false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom'], 'numero max 9: ' || r::text;

  -- 6) filtro de data (o 'ontem' legado fica de fora, sem erro)
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_data, 'tipo', 'data', 'de', '2026-01-01', 'ate', '2026-03-31')), false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'data: ' || r::text;

  -- 7) filtro de opções e de texto
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_st, 'tipo', 'opcoes', 'v', 'Feito')), false, null, null, false, 0, 100) l order by 1) into r;
  assert r = array['Oficina_do João', 'Padaria São José'], 'opcoes: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_nome, 'tipo', 'texto', 'v', 'JOS')), false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'texto jos: ' || r::text;

  -- 8) ordenação numérica asc/desc: não numéricos (abc, vazio) sempre no fim, na ordem original
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_num, 'numero', false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom', 'Padaria São José', 'Oficina_do João', 'sem numero', null], 'ordem numero asc: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_num, 'numero', true, 0, 100) l) into r;
  assert r = array['Oficina_do João', 'Padaria São José', 'Mercado 100% Bom', 'sem numero', null], 'ordem numero desc: ' || r::text;

  -- 9) ordenação de texto (sem distinguir maiúsculas), vazios no fim
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_nome, 'texto', false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom', 'Oficina_do João', 'Padaria São José', 'sem numero', null], 'ordem texto asc: ' || r::text;

  -- 10) paginação: total continua 5
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 2, 2) l) into r;
  assert r = array['Oficina_do João', 'sem numero'], 'pagina 2: ' || r::text;
  select total into n from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 2, 2) limit 1;
  assert n = 5, 'total na pagina 2 deveria ser 5, veio ' || coalesce(n::text, 'null');

  -- 11) nenhuma linha casa: total ausente (0 linhas), sem erro
  select array(select l.id::text from consultar_planilha_linhas(v_pl, 'zzzz-nao-existe', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert coalesce(array_length(r, 1), 0) = 0, 'busca sem resultado deveria vir vazia';

  raise notice '049 OK';
end $$;

rollback;
select '049 OK (dados de teste desfeitos com rollback)' as resultado;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/049_planilhas_consulta.sql supabase/tests/049_consultar_planilha_smoke.sql
git commit -m "feat(tabelas): migration 049 com consultar_planilha_linhas e teste SQL de fumaça"
```

---

### Task 2: Consulta pura e parâmetros da RPC (`lib/tabelas/consulta.ts`, `lib/tabelas/consultar.ts`)

**Files:**
- Create: `lib/tabelas/consulta.ts`, `lib/tabelas/consultar.ts`
- Test: `tests/tabelas-consulta.test.ts`, `tests/tabelas-consultar.test.ts`

**Interfaces:**
- Consumes: `paraNumero`, `paraDataISO`, `TipoColuna`, `ValorCelula` de `./tipos`; `ehUuid` de `./editar-celula`.
- Produces (`consulta.ts`):
  - `interface FiltroColuna { v?: string; min?: number; max?: number; de?: string; ate?: string }`
  - `interface Consulta { q: string; filtros: Record<string, FiltroColuna>; ordem: string | null; desc: boolean; semCliente: boolean }`
  - `interface ParamsBrutos { q?: string; filtros?: string; ordem?: string; dir?: string; semCliente?: string }`
  - `interface ColunaConsulta { id: string; tipo: TipoColuna }`
  - `const MAX_BUSCA = 200`
  - `parseConsulta(bruto: ParamsBrutos, colunas: ColunaConsulta[]): Consulta`
  - `serializeConsulta(c: Consulta, pagina?: number): string` — query string **sem** `?`, vazia quando tudo é padrão
  - `toRpcFiltros(c: Consulta, colunas: ColunaConsulta[]): { coluna: string; tipo: TipoColuna; v?: string; min?: number; max?: number; de?: string; ate?: string }[]`
  - `alternarOrdem(c: Consulta, colunaId: string): Consulta` — não ordenada → asc → desc → sem ordenação
  - `temConsultaAtiva(c: Consulta): boolean` — `q`, filtros ou `semCliente` (ordenação não conta)
- Produces (`consultar.ts`):
  - `interface LinhaConsultada { id: string; dados: Record<string, ValorCelula>; cliente_id: string | null; ordem: number }`
  - `parametrosRpc(planilhaId: string, c: Consulta, colunas: ColunaConsulta[], offset: number, limit: number)` — objeto com as chaves `p_*` da função SQL
  - `consultarLinhas(supabase: SupabaseClient, planilhaId: string, c: Consulta, colunas: ColunaConsulta[], offset: number, limit: number): Promise<{ linhas: LinhaConsultada[]; total: number; error: string | null }>`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-consulta.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConsulta, serializeConsulta, toRpcFiltros, alternarOrdem, temConsultaAtiva, MAX_BUSCA, type Consulta } from '../lib/tabelas/consulta'

const C_TXT = '11111111-1111-4111-8111-111111111111'
const C_NUM = '22222222-2222-4222-8222-222222222222'
const C_DAT = '33333333-3333-4333-8333-333333333333'
const C_OPC = '44444444-4444-4444-8444-444444444444'
const C_CLI = '55555555-5555-4555-8555-555555555555'
const colunas = [
  { id: C_TXT, tipo: 'texto' as const },
  { id: C_NUM, tipo: 'numero' as const },
  { id: C_DAT, tipo: 'data' as const },
  { id: C_OPC, tipo: 'opcoes' as const },
  { id: C_CLI, tipo: 'cliente' as const },
]
const vazia: Consulta = { q: '', filtros: {}, ordem: null, desc: false, semCliente: false }

test('parametros vazios dão a consulta padrão', () => {
  assert.deepEqual(parseConsulta({}, colunas), vazia)
})

test('q é aparada e limitada', () => {
  assert.equal(parseConsulta({ q: '  padaria  ' }, colunas).q, 'padaria')
  assert.equal(parseConsulta({ q: 'x'.repeat(MAX_BUSCA + 50) }, colunas).q.length, MAX_BUSCA)
})

test('filtros válidos por tipo, com formato brasileiro', () => {
  const filtros = JSON.stringify({
    [C_TXT]: { v: ' jos ' },
    [C_NUM]: { min: '1.234,5', max: 5000 },
    [C_DAT]: { de: '15/03/2026', ate: '2026-12-31' },
    [C_OPC]: { v: 'Feito' },
    [C_CLI]: { v: 'acme' },
  })
  const c = parseConsulta({ filtros }, colunas)
  assert.deepEqual(c.filtros[C_TXT], { v: 'jos' })
  assert.deepEqual(c.filtros[C_NUM], { min: 1234.5, max: 5000 })
  assert.deepEqual(c.filtros[C_DAT], { de: '2026-03-15', ate: '2026-12-31' })
  assert.deepEqual(c.filtros[C_OPC], { v: 'Feito' })
  assert.deepEqual(c.filtros[C_CLI], { v: 'acme' })
})

test('filtros inválidos são ignorados sem erro', () => {
  assert.deepEqual(parseConsulta({ filtros: '{não é json' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: '[1,2]' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: '"texto"' }, colunas).filtros, {})
  assert.deepEqual(parseConsulta({ filtros: 'x'.repeat(5000) }, colunas).filtros, {})
  const c = parseConsulta({
    filtros: JSON.stringify({
      '66666666-6666-4666-8666-666666666666': { v: 'coluna que não existe' },
      __proto__: { v: 'x' },
      [C_NUM]: { min: 'abc', max: '' },
      [C_DAT]: { de: '31/02/2026' },
      [C_TXT]: { v: '   ' },
    }),
  }, colunas)
  assert.deepEqual(c.filtros, {})
})

test('ordem só vale para coluna existente; dir=desc', () => {
  assert.equal(parseConsulta({ ordem: C_NUM }, colunas).ordem, C_NUM)
  assert.equal(parseConsulta({ ordem: 'lixo' }, colunas).ordem, null)
  assert.equal(parseConsulta({ ordem: '66666666-6666-4666-8666-666666666666' }, colunas).ordem, null)
  assert.equal(parseConsulta({ ordem: C_NUM, dir: 'desc' }, colunas).desc, true)
  assert.equal(parseConsulta({ ordem: C_NUM, dir: 'qualquer' }, colunas).desc, false)
})

test('semCliente só vale se há coluna cliente', () => {
  assert.equal(parseConsulta({ semCliente: '1' }, colunas).semCliente, true)
  assert.equal(parseConsulta({ semCliente: '1' }, colunas.filter(c => c.tipo !== 'cliente')).semCliente, false)
})

test('serialize é vazio no padrão e ida-e-volta preserva a consulta', () => {
  assert.equal(serializeConsulta(vazia), '')
  const original: Consulta = {
    q: 'padaria & cia',
    filtros: { [C_NUM]: { min: 10, max: 100 }, [C_DAT]: { de: '2026-01-01' } },
    ordem: C_NUM, desc: true, semCliente: true,
  }
  const qs = serializeConsulta(original, 3)
  const sp = new URLSearchParams(qs)
  assert.equal(sp.get('pagina'), '3')
  const volta = parseConsulta({
    q: sp.get('q') ?? undefined, filtros: sp.get('filtros') ?? undefined, ordem: sp.get('ordem') ?? undefined,
    dir: sp.get('dir') ?? undefined, semCliente: sp.get('semCliente') ?? undefined,
  }, colunas)
  assert.deepEqual(volta, original)
})

test('serialize omite pagina 1 e ordem asc não escreve dir', () => {
  const qs = serializeConsulta({ ...vazia, ordem: C_TXT }, 1)
  const sp = new URLSearchParams(qs)
  assert.equal(sp.get('pagina'), null)
  assert.equal(sp.get('ordem'), C_TXT)
  assert.equal(sp.get('dir'), null)
})

test('toRpcFiltros leva o tipo da coluna e ignora colunas removidas', () => {
  const c: Consulta = { ...vazia, filtros: { [C_NUM]: { min: 1 }, '66666666-6666-4666-8666-666666666666': { v: 'x' } } }
  assert.deepEqual(toRpcFiltros(c, colunas), [{ coluna: C_NUM, tipo: 'numero', min: 1 }])
})

test('alternarOrdem: nova coluna asc, depois desc, depois limpa', () => {
  const a = alternarOrdem(vazia, C_TXT)
  assert.deepEqual([a.ordem, a.desc], [C_TXT, false])
  const b = alternarOrdem(a, C_TXT)
  assert.deepEqual([b.ordem, b.desc], [C_TXT, true])
  const c = alternarOrdem(b, C_TXT)
  assert.deepEqual([c.ordem, c.desc], [null, false])
  const d = alternarOrdem(b, C_NUM)
  assert.deepEqual([d.ordem, d.desc], [C_NUM, false])
})

test('temConsultaAtiva ignora ordenação', () => {
  assert.equal(temConsultaAtiva(vazia), false)
  assert.equal(temConsultaAtiva({ ...vazia, ordem: C_TXT }), false)
  assert.equal(temConsultaAtiva({ ...vazia, q: 'a' }), true)
  assert.equal(temConsultaAtiva({ ...vazia, semCliente: true }), true)
  assert.equal(temConsultaAtiva({ ...vazia, filtros: { [C_TXT]: { v: 'a' } } }), true)
})
```

```ts
// tests/tabelas-consultar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parametrosRpc } from '../lib/tabelas/consultar'
import type { Consulta } from '../lib/tabelas/consulta'

const C_NUM = '22222222-2222-4222-8222-222222222222'
const PL = '99999999-9999-4999-8999-999999999999'
const colunas = [{ id: C_NUM, tipo: 'numero' as const }]
const vazia: Consulta = { q: '', filtros: {}, ordem: null, desc: false, semCliente: false }

test('consulta vazia vira parâmetros neutros', () => {
  assert.deepEqual(parametrosRpc(PL, vazia, colunas, 0, 100), {
    p_planilha: PL, p_busca: null, p_filtros: [], p_sem_cliente: false,
    p_ordem_coluna: null, p_ordem_tipo: null, p_ordem_desc: false, p_offset: 0, p_limit: 100,
  })
})

test('busca, filtros, ordem e semCliente são repassados com o tipo da coluna', () => {
  const c: Consulta = { q: 'abc', filtros: { [C_NUM]: { min: 5 } }, ordem: C_NUM, desc: true, semCliente: true }
  const p = parametrosRpc(PL, c, colunas, 200, 100)
  assert.equal(p.p_busca, 'abc')
  assert.deepEqual(p.p_filtros, [{ coluna: C_NUM, tipo: 'numero', min: 5 }])
  assert.equal(p.p_ordem_coluna, C_NUM)
  assert.equal(p.p_ordem_tipo, 'numero')
  assert.equal(p.p_ordem_desc, true)
  assert.equal(p.p_sem_cliente, true)
  assert.equal(p.p_offset, 200)
})

test('offset e limit são normalizados (nunca negativos, limit até 1000)', () => {
  const p = parametrosRpc(PL, vazia, colunas, -5, 99999)
  assert.equal(p.p_offset, 0)
  assert.equal(p.p_limit, 1000)
  assert.equal(parametrosRpc(PL, vazia, colunas, 0, -1).p_limit, 0)
})

test('ordem para coluna que não existe mais é descartada', () => {
  const p = parametrosRpc(PL, { ...vazia, ordem: '66666666-6666-4666-8666-666666666666' }, colunas, 0, 10)
  assert.equal(p.p_ordem_coluna, null)
  assert.equal(p.p_ordem_tipo, null)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-consulta.test.ts tests/tabelas-consultar.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `consulta.ts`**

```ts
// lib/tabelas/consulta.ts
import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna } from './tipos'
import { ehUuid } from './editar-celula'

export interface FiltroColuna { v?: string; min?: number; max?: number; de?: string; ate?: string }
export interface Consulta {
  q: string
  filtros: Record<string, FiltroColuna>
  ordem: string | null
  desc: boolean
  semCliente: boolean
}
export interface ParamsBrutos { q?: string; filtros?: string; ordem?: string; dir?: string; semCliente?: string }
export interface ColunaConsulta { id: string; tipo: TipoColuna }

export const MAX_BUSCA = 200
const MAX_FILTROS_JSON = 4000

function textoCurto(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t === '' ? undefined : t.slice(0, MAX_BUSCA)
}

function numero(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = paraNumero(typeof v === 'number' ? v : String(v))
  return n === null ? undefined : n
}

function data(v: unknown): string | undefined {
  return typeof v === 'string' ? (paraDataISO(v.trim()) ?? undefined) : undefined
}

// Filtro válido para o tipo da coluna, ou null quando não sobra nada útil.
function limparFiltro(tipo: TipoColuna, bruto: unknown): FiltroColuna | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null
  const b = bruto as Record<string, unknown>
  const f: FiltroColuna = {}
  if (tipo === 'texto' || tipo === 'cliente' || tipo === 'opcoes') {
    const v = textoCurto(b.v)
    if (v !== undefined) f.v = v
  } else if (tipo === 'numero') {
    const min = numero(b.min)
    const max = numero(b.max)
    if (min !== undefined) f.min = min
    if (max !== undefined) f.max = max
  } else if (tipo === 'data') {
    const de = data(b.de)
    const ate = data(b.ate)
    if (de !== undefined) f.de = de
    if (ate !== undefined) f.ate = ate
  }
  return Object.keys(f).length > 0 ? f : null
}

// A URL é entrada não confiável: tudo que não é válido é ignorado em silêncio.
export function parseConsulta(bruto: ParamsBrutos, colunas: ColunaConsulta[]): Consulta {
  const tipoPorId = new Map(colunas.map(c => [c.id, c.tipo]))

  const filtros: Record<string, FiltroColuna> = {}
  if (typeof bruto.filtros === 'string' && bruto.filtros.length <= MAX_FILTROS_JSON) {
    try {
      const obj: unknown = JSON.parse(bruto.filtros)
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        for (const [id, valor] of Object.entries(obj)) {
          const tipo = tipoPorId.get(id)
          if (!tipo || !ehUuid(id)) continue
          const f = limparFiltro(tipo, valor)
          if (f) filtros[id] = f
        }
      }
    } catch {
      // parâmetro corrompido: consulta sem filtros
    }
  }

  const ordem = typeof bruto.ordem === 'string' && tipoPorId.has(bruto.ordem) ? bruto.ordem : null
  const temCliente = colunas.some(c => c.tipo === 'cliente')

  return {
    q: textoCurto(bruto.q) ?? '',
    filtros,
    ordem,
    desc: ordem !== null && bruto.dir === 'desc',
    semCliente: bruto.semCliente === '1' && temCliente,
  }
}

// Query string (sem "?"); vazia quando tudo está no padrão.
export function serializeConsulta(c: Consulta, pagina: number = 1): string {
  const qs = new URLSearchParams()
  if (c.q !== '') qs.set('q', c.q)
  if (Object.keys(c.filtros).length > 0) qs.set('filtros', JSON.stringify(c.filtros))
  if (c.ordem) {
    qs.set('ordem', c.ordem)
    if (c.desc) qs.set('dir', 'desc')
  }
  if (c.semCliente) qs.set('semCliente', '1')
  if (pagina > 1) qs.set('pagina', String(pagina))
  return qs.toString()
}

export function toRpcFiltros(
  c: Consulta,
  colunas: ColunaConsulta[],
): { coluna: string; tipo: TipoColuna; v?: string; min?: number; max?: number; de?: string; ate?: string }[] {
  const tipoPorId = new Map(colunas.map(col => [col.id, col.tipo]))
  const saida: { coluna: string; tipo: TipoColuna; v?: string; min?: number; max?: number; de?: string; ate?: string }[] = []
  for (const [id, f] of Object.entries(c.filtros)) {
    const tipo = tipoPorId.get(id)
    if (tipo) saida.push({ coluna: id, tipo, ...f })
  }
  return saida
}

// Clique no cabeçalho: nova coluna -> asc; mesma coluna asc -> desc; desc -> sem ordenação.
export function alternarOrdem(c: Consulta, colunaId: string): Consulta {
  if (c.ordem !== colunaId) return { ...c, ordem: colunaId, desc: false }
  if (!c.desc) return { ...c, ordem: colunaId, desc: true }
  return { ...c, ordem: null, desc: false }
}

export function temConsultaAtiva(c: Consulta): boolean {
  return c.q !== '' || Object.keys(c.filtros).length > 0 || c.semCliente
}
```

- [ ] **Step 4: Implementar `consultar.ts`**

```ts
// lib/tabelas/consultar.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { toRpcFiltros, type Consulta, type ColunaConsulta } from './consulta'
import type { ValorCelula } from './tipos'

export interface LinhaConsultada {
  id: string
  dados: Record<string, ValorCelula>
  cliente_id: string | null
  ordem: number
}

// Argumentos da função SQL consultar_planilha_linhas (migration 049).
export function parametrosRpc(
  planilhaId: string,
  c: Consulta,
  colunas: ColunaConsulta[],
  offset: number,
  limit: number,
) {
  const colOrdem = c.ordem ? colunas.find(col => col.id === c.ordem) : undefined
  return {
    p_planilha: planilhaId,
    p_busca: c.q === '' ? null : c.q,
    p_filtros: toRpcFiltros(c, colunas),
    p_sem_cliente: c.semCliente,
    p_ordem_coluna: colOrdem ? colOrdem.id : null,
    p_ordem_tipo: colOrdem ? colOrdem.tipo : null,
    p_ordem_desc: c.desc,
    p_offset: Math.max(0, Math.floor(offset)),
    p_limit: Math.min(1000, Math.max(0, Math.floor(limit))),
  }
}

// `total` = linhas que casam com a consulta (vem repetido em cada linha da
// resposta). Com offset 0 e limit 1 a chamada serve só para descobrir o total.
export async function consultarLinhas(
  supabase: SupabaseClient,
  planilhaId: string,
  c: Consulta,
  colunas: ColunaConsulta[],
  offset: number,
  limit: number,
): Promise<{ linhas: LinhaConsultada[]; total: number; error: string | null }> {
  const { data, error } = await supabase.rpc('consultar_planilha_linhas', parametrosRpc(planilhaId, c, colunas, offset, limit))
  if (error) return { linhas: [], total: 0, error: error.message }
  const rows = (data ?? []) as (LinhaConsultada & { total: number | string })[]
  return {
    linhas: rows.map(r => ({ id: r.id, dados: r.dados, cliente_id: r.cliente_id, ordem: r.ordem })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    error: null,
  }
}
```

- [ ] **Step 5: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/tabelas-consulta.test.ts tests/tabelas-consultar.test.ts && npx tsc --noEmit`
Expected: PASS (14 testes) e `tsc` limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/tabelas/consulta.ts lib/tabelas/consultar.ts tests/tabelas-consulta.test.ts tests/tabelas-consultar.test.ts
git commit -m "feat(tabelas): consulta validada por URL e parâmetros da função SQL de consulta"
```

---

### Task 3: Exportar para Excel (`lib/tabelas/exportar-xlsx.ts`)

**Files:**
- Create: `lib/tabelas/exportar-xlsx.ts`
- Test: `tests/tabelas-exportar-xlsx.test.ts`

**Interfaces:**
- Consumes: `TipoColuna`, `ValorCelula` de `./tipos`; `xlsx`.
- Produces:
  - `interface ColunaExport { id: string; nome: string; tipo: TipoColuna }`
  - `interface LinhaExport { dados: Record<string, ValorCelula> }`
  - `nomeAbaSeguro(nome: string): string` — remove `[ ] : * ? / \`, aparado, até 31 caracteres, `Tabela` se ficar vazio
  - `nomeArquivoSeguro(nome: string): string` — minúsculas, sem acento, `[a-z0-9]` separados por `-`, até 60 caracteres, `tabela` se ficar vazio, com `.xlsx`
  - `montarXlsx(nome: string, colunas: ColunaExport[], linhas: LinhaExport[]): Uint8Array`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-exportar-xlsx.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { montarXlsx, nomeAbaSeguro, nomeArquivoSeguro } from '../lib/tabelas/exportar-xlsx'
import { lerPlanilha } from '../lib/tabelas/parse-planilha'

const A = 'a1111111-1111-4111-8111-111111111111'
const B = 'b2222222-2222-4222-8222-222222222222'
const C = 'c3333333-3333-4333-8333-333333333333'
const D = 'd4444444-4444-4444-8444-444444444444'
const colunas = [
  { id: A, nome: 'Nome', tipo: 'texto' as const },
  { id: B, nome: 'Valor', tipo: 'numero' as const },
  { id: C, nome: 'Vencimento', tipo: 'data' as const },
  { id: D, nome: 'Status', tipo: 'opcoes' as const },
]

function ler(nome: string, linhas: { dados: Record<string, string | number | null> }[]) {
  const bytes = montarXlsx(nome, colunas, linhas)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return lerPlanilha(buf)
}

test('ida e volta: cabeçalhos, número real, data real e vazios', () => {
  const r = ler('Certificados', [
    { dados: { [A]: 'Padaria', [B]: 1234.5, [C]: '2026-03-15', [D]: 'Feito' } },
    { dados: { [A]: 'Mercado', [B]: null, [C]: null, [D]: null } },
  ])
  assert.deepEqual(r.cabecalhos, ['Nome', 'Valor', 'Vencimento', 'Status'])
  assert.deepEqual(r.linhas[0], ['Padaria', 1234.5, '2026-03-15', 'Feito'])
  assert.deepEqual(r.linhas[1], ['Mercado', null, null, null])
})

test('valor legado que não converteu continua como texto; quebra de linha é preservada', () => {
  const r = ler('T', [{ dados: { [A]: 'Rua X\nSala 4', [B]: 'abc', [C]: 'ontem', [D]: null } }])
  assert.equal(r.linhas[0][0], 'Rua X\nSala 4')
  assert.equal(r.linhas[0][1], 'abc')
  assert.equal(r.linhas[0][2], 'ontem')
})

test('texto que parece fórmula continua sendo texto (não vira fórmula)', () => {
  const bytes = montarXlsx('T', colunas, [{ dados: { [A]: '=SOMA(A1:A2)', [B]: null, [C]: null, [D]: null } }])
  const wb = XLSX.read(bytes, { type: 'array' })
  const cel = wb.Sheets[wb.SheetNames[0]]['A2']
  assert.equal(cel.t, 's')
  assert.equal(cel.f, undefined)
})

test('tabela sem linhas gera só o cabeçalho', () => {
  const bytes = montarXlsx('Vazia', colunas, [])
  const wb = XLSX.read(bytes, { type: 'array' })
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.equal(aoa.length, 1)
})

test('nomeAbaSeguro remove caracteres proibidos e limita a 31', () => {
  assert.equal(nomeAbaSeguro('Clientes: [A]/B*?\\'), 'Clientes AB')
  assert.equal(nomeAbaSeguro('x'.repeat(50)).length, 31)
  assert.equal(nomeAbaSeguro('   '), 'Tabela')
  assert.equal(nomeAbaSeguro(':[]'), 'Tabela')
})

test('nomeArquivoSeguro: sem acento, minúsculo, hífens, extensão', () => {
  assert.equal(nomeArquivoSeguro('Relatório: A/B — 2026'), 'relatorio-a-b-2026.xlsx')
  assert.equal(nomeArquivoSeguro('***'), 'tabela.xlsx')
  assert.ok(nomeArquivoSeguro('x'.repeat(200)).length <= 65)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-exportar-xlsx.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/exportar-xlsx.ts
import * as XLSX from 'xlsx'
import type { TipoColuna, ValorCelula } from './tipos'

export interface ColunaExport { id: string; nome: string; tipo: TipoColuna }
export interface LinhaExport { dados: Record<string, ValorCelula> }

export function nomeAbaSeguro(nome: string): string {
  const limpo = nome.replace(/[\[\]:*?/\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 31).trim()
  return limpo === '' ? 'Tabela' : limpo
}

export function nomeArquivoSeguro(nome: string): string {
  const base = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${base === '' ? 'tabela' : base}.xlsx`
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

// Números e datas viram células reais do Excel; o que a importação manteve
// como texto (não convertível) continua texto. Strings nunca viram fórmula:
// o SheetJS grava string como string (t:'s'), sem interpretar '=' no início.
function celulaExport(tipo: TipoColuna, valor: ValorCelula): string | number | Date | null {
  if (valor === null) return null
  if (tipo === 'data' && typeof valor === 'string') {
    const m = ISO.exec(valor)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return valor
  }
  return valor
}

export function montarXlsx(nome: string, colunas: ColunaExport[], linhas: LinhaExport[]): Uint8Array {
  const aoa: (string | number | Date | null)[][] = [
    colunas.map(c => c.nome),
    ...linhas.map(l => colunas.map(c => celulaExport(c.tipo, l.dados[c.id] ?? null))),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

  colunas.forEach((c, i) => {
    if (c.tipo !== 'data') return
    for (let r = 1; r <= linhas.length; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: i })]
      if (cel && cel.t === 'd') cel.z = 'dd/mm/yyyy'
    }
  })
  ws['!cols'] = colunas.map(c => ({ wch: Math.min(Math.max(c.nome.length + 2, 12), 40) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomeAbaSeguro(nome))
  const saida = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer
  return new Uint8Array(saida)
}
```

- [ ] **Step 4: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/tabelas-exportar-xlsx.test.ts && npx tsc --noEmit`
Expected: PASS (6 testes) e `tsc` limpo. Se a data sair um dia errado na ida e volta, o problema é o `+10 min` de `lerPlanilha` contra `new Date(y, m-1, d)` (meia-noite local): ajustar **apenas** `celulaExport` (por exemplo, meio-dia local `new Date(y, m-1, d, 12)`), nunca o teste.

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/exportar-xlsx.ts tests/tabelas-exportar-xlsx.test.ts
git commit -m "feat(tabelas): montagem do arquivo Excel com números e datas reais"
```

---

### Task 4: Rota de exportação (`app/api/tabelas/[id]/exportar/route.ts`)

**Files:**
- Create: `app/api/tabelas/[id]/exportar/route.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`; `ehUuid` de `@/lib/tabelas/editar-celula`; `parseConsulta` de `@/lib/tabelas/consulta`; `consultarLinhas` de `@/lib/tabelas/consultar`; `montarXlsx`, `nomeArquivoSeguro` de `@/lib/tabelas/exportar-xlsx`; `TipoColuna` de `@/lib/tabelas/tipos`.
- Produces: `GET /api/tabelas/<id>/exportar?q=&filtros=&ordem=&dir=&semCliente=` → `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment`). 400 id inválido, 401 sem sessão, 404 tabela inexistente **ou sem permissão de leitura (RLS)**, 500 falha na consulta. Exporta todas as linhas da consulta (sem paginação), em lotes de 1000, até `MAX_LINHAS_EXPORT = 20000`.

- [ ] **Step 1: Ler a doc de Route Handlers**

Run: `ls node_modules/next/dist/docs/01-app/03-api-reference/ && sed -n 1,40p "app/api/arquivos/[tabela]/[id]/route.ts"`
Expected: confirmar a assinatura `GET(request, { params }: { params: Promise<{ id: string }> })` deste Next e o padrão de autenticação das rotas existentes. Contexto já verificado: o `proxy.ts` roda para tudo exceto arquivos estáticos e só aplica checagem de setor/página a caminhos que começam por um prefixo de setor; `/api/tabelas/...` passa por ele apenas para renovar a sessão, então **a rota precisa fazer a própria autenticação** (é o que o código abaixo faz).

- [ ] **Step 2: Escrever a rota**

```ts
// app/api/tabelas/[id]/exportar/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ehUuid } from '@/lib/tabelas/editar-celula'
import { parseConsulta } from '@/lib/tabelas/consulta'
import { consultarLinhas, type LinhaConsultada } from '@/lib/tabelas/consultar'
import { montarXlsx, nomeArquivoSeguro } from '@/lib/tabelas/exportar-xlsx'
import type { TipoColuna } from '@/lib/tabelas/tipos'

const LOTE = 1000
const MAX_LINHAS_EXPORT = 20000
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'Tabela inválida.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  // Cliente do USUÁRIO: a RLS por setor decide quem lê. Quem não é do setor
  // recebe o mesmo 404 de uma tabela que não existe.
  const { data: planilha } = await supabase.from('planilhas').select('id, nome').eq('id', id).maybeSingle()
  if (!planilha) return NextResponse.json({ error: 'Tabela não encontrada.' }, { status: 404 })

  const { data: colunasRaw } = await supabase
    .from('planilha_colunas').select('id, nome, tipo').eq('planilha_id', id).order('ordem')
  const colunas = (colunasRaw ?? []) as { id: string; nome: string; tipo: TipoColuna }[]

  const sp = new URL(request.url).searchParams
  const consulta = parseConsulta({
    q: sp.get('q') ?? undefined,
    filtros: sp.get('filtros') ?? undefined,
    ordem: sp.get('ordem') ?? undefined,
    dir: sp.get('dir') ?? undefined,
    semCliente: sp.get('semCliente') ?? undefined,
  }, colunas)

  const linhas: LinhaConsultada[] = []
  for (let offset = 0; offset < MAX_LINHAS_EXPORT; offset += LOTE) {
    const r = await consultarLinhas(supabase, id, consulta, colunas, offset, LOTE)
    if (r.error) return NextResponse.json({ error: 'Não foi possível gerar o arquivo.' }, { status: 500 })
    linhas.push(...r.linhas)
    if (r.linhas.length < LOTE || linhas.length >= r.total) break
  }

  const bytes = montarXlsx(planilha.nome as string, colunas, linhas)
  const arquivo = nomeArquivoSeguro(planilha.nome as string)
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint "app/api/tabelas"`
Expected: sem erros. Se o TypeScript recusar `bytes as BodyInit`, usar `new Blob([bytes], { type: XLSX_MIME })` como corpo; não usar `any`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/tabelas"
git commit -m "feat(tabelas): rota de exportação para Excel respeitando a consulta ativa"
```

---

### Task 5: Barra de consulta, ordenação e página (`BarraConsulta`, `TabelaDetalhe`, `TabelaEditavel`, 5 rotas)

**Files:**
- Create: `components/tabelas/BarraConsulta.tsx`
- Modify: `components/tabelas/TabelaDetalhe.tsx` (reescrever)
- Modify: `components/tabelas/TabelaEditavel.tsx` (props, cabeçalho, mensagem de vazio)
- Modify: `app/{fiscal,contabil,pessoal,societario,financeiro}/tabelas/[id]/page.tsx` (5 arquivos)

**Interfaces:**
- Consumes: `parseConsulta`, `serializeConsulta`, `alternarOrdem`, `temConsultaAtiva`, `Consulta`, `ParamsBrutos` de `@/lib/tabelas/consulta`; `consultarLinhas` de `@/lib/tabelas/consultar`; `paginar`, `POR_PAGINA`, `podeEditarLinhas`; `TabelaEditavel`, `ColunaGrade`, `LinhaGrade`.
- Produces:
  - `TabelaDetalhe({ setor, id, params }: { setor: SetorTabela; id: string; params: ParamsBrutos & { pagina?: string } })`
  - `BarraConsulta({ base, consulta, colunas, exportarHref })` com `ColunaFiltro { id; nome; tipo; opcoes }`
  - novas props de `TabelaEditavel`: `ordenacao: { coluna: string | null; desc: boolean; hrefs: Record<string, string> }` e `consultaAtiva: boolean`

- [ ] **Step 1: Ler o guia de Client Components (se necessário)**

Run: `ls node_modules/next/dist/docs/01-app/01-getting-started/`
Expected: conferir `useRouter`/`usePathname` de `next/navigation` e `Link` em Client Components (já usados em `TabelaEditavel.tsx`).

- [ ] **Step 2: Criar `BarraConsulta.tsx`**

```tsx
// components/tabelas/BarraConsulta.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { parseConsulta, serializeConsulta, type Consulta } from '@/lib/tabelas/consulta'
import type { OpcaoColuna, TipoColuna } from '@/lib/tabelas/tipos'

export interface ColunaFiltro { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

interface Props {
  base: string
  consulta: Consulta
  colunas: ColunaFiltro[]
  exportarHref: string
}

type Campos = { v?: string; min?: string; max?: string; de?: string; ate?: string }

const inputCls = 'px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

function camposIniciais(consulta: Consulta): Record<string, Campos> {
  const r: Record<string, Campos> = {}
  for (const [id, f] of Object.entries(consulta.filtros)) {
    r[id] = {
      v: f.v,
      min: f.min === undefined ? undefined : String(f.min).replace('.', ','),
      max: f.max === undefined ? undefined : String(f.max).replace('.', ','),
      de: f.de,
      ate: f.ate,
    }
  }
  return r
}

export default function BarraConsulta({ base, consulta, colunas, exportarHref }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(consulta.q)
  const [campos, setCampos] = useState<Record<string, Campos>>(() => camposIniciais(consulta))
  const ativos = Object.keys(consulta.filtros).length
  const [aberto, setAberto] = useState(ativos > 0)

  function definir(id: string, campo: keyof Campos, valor: string) {
    setCampos(c => ({ ...c, [id]: { ...c[id], [campo]: valor } }))
  }

  function ir(nova: Consulta) {
    const qs = serializeConsulta(nova, 1)
    router.push(qs ? `${base}?${qs}` : base)
  }

  function aplicar(e?: FormEvent) {
    e?.preventDefault()
    // Reaproveita a mesma validação da URL (formato brasileiro, datas reais...).
    ir(parseConsulta({
      q,
      filtros: JSON.stringify(campos),
      ordem: consulta.ordem ?? undefined,
      dir: consulta.desc ? 'desc' : 'asc',
      semCliente: consulta.semCliente ? '1' : undefined,
    }, colunas))
  }

  function limpar() {
    setQ('')
    setCampos({})
    ir({ q: '', filtros: {}, ordem: consulta.ordem, desc: consulta.desc, semCliente: consulta.semCliente })
  }

  const rotulo = (c: ColunaFiltro) => (
    <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">{c.nome}</label>
  )

  return (
    <form onSubmit={aplicar} className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar em todas as colunas…"
          aria-label="Buscar em todas as colunas" maxLength={200} className={`${inputCls} flex-1 min-w-[14rem]`} />
        <button type="submit"
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)]">
          Buscar
        </button>
        <button type="button" onClick={() => setAberto(a => !a)}
          className="px-3 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm">
          Filtros{ativos > 0 ? ` (${ativos})` : ''}
        </button>
        <a href={exportarHref}
          className="px-3 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm">
          Exportar Excel
        </a>
      </div>

      {aberto && (
        <div className="rounded-xl border border-[var(--fg)]/12 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {colunas.map(c => (
              <div key={c.id}>
                {rotulo(c)}
                {(c.tipo === 'texto' || c.tipo === 'cliente') && (
                  <input className={`${inputCls} w-full`} placeholder="contém…" value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`} />
                )}
                {c.tipo === 'opcoes' && (
                  <select className={`${inputCls} w-full`} value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`}>
                    <option value="">Todas</option>
                    {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
                  </select>
                )}
                {c.tipo === 'numero' && (
                  <div className="flex gap-2">
                    <input className={`${inputCls} w-full`} placeholder="mín." inputMode="decimal" value={campos[c.id]?.min ?? ''}
                      onChange={e => definir(c.id, 'min', e.target.value)} aria-label={`${c.nome} mínimo`} />
                    <input className={`${inputCls} w-full`} placeholder="máx." inputMode="decimal" value={campos[c.id]?.max ?? ''}
                      onChange={e => definir(c.id, 'max', e.target.value)} aria-label={`${c.nome} máximo`} />
                  </div>
                )}
                {c.tipo === 'data' && (
                  <div className="flex gap-2">
                    <input type="date" className={`${inputCls} w-full`} value={campos[c.id]?.de ?? ''}
                      onChange={e => definir(c.id, 'de', e.target.value)} aria-label={`${c.nome} a partir de`} />
                    <input type="date" className={`${inputCls} w-full`} value={campos[c.id]?.ate ?? ''}
                      onChange={e => definir(c.id, 'ate', e.target.value)} aria-label={`${c.nome} até`} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)]">
              Aplicar filtros
            </button>
            <button type="button" onClick={limpar}
              className="px-4 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] text-sm">
              Limpar
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Reescrever `TabelaDetalhe.tsx`**

```tsx
// components/tabelas/TabelaDetalhe.tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeEditarLinhas } from '@/lib/tabelas/permissoes'
import { paginar, POR_PAGINA } from '@/lib/tabelas/paginacao'
import { parseConsulta, serializeConsulta, alternarOrdem, temConsultaAtiva, type ParamsBrutos } from '@/lib/tabelas/consulta'
import { consultarLinhas } from '@/lib/tabelas/consultar'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import TabelaEditavel, { type ColunaGrade, type LinhaGrade } from './TabelaEditavel'
import BarraConsulta from './BarraConsulta'

interface Props {
  setor: SetorTabela
  id: string
  params: ParamsBrutos & { pagina?: string }
}

export default async function TabelaDetalhe({ setor, id, params }: Props) {
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
  const podeEditar = podeEditarLinhas(profile, setor)

  const consulta = parseConsulta(params, colunas)

  // 1ª chamada só para saber o total (limit 1); depois busca a página já limitada.
  const contagem = await consultarLinhas(supabase, id, consulta, colunas, 0, 1)
  const { pagina, totalPaginas, de } = paginar(params.pagina, contagem.total)
  const resultado = contagem.error || contagem.total === 0
    ? { linhas: [], total: contagem.total, error: contagem.error }
    : await consultarLinhas(supabase, id, consulta, colunas, de, POR_PAGINA)
  const linhas = resultado.linhas as LinhaGrade[]
  const total = contagem.total

  // A lista de clientes só é buscada para quem pode editar e se há coluna Cliente.
  // (PostgREST limita a 1000 linhas por consulta; acima disso o seletor fica parcial.)
  let clientes: ClienteMatch[] = []
  if (podeEditar && temColunaCliente) {
    const { data } = await supabase.from('clientes').select('id, nome, cnpj').order('nome')
    clientes = (data ?? []) as ClienteMatch[]
  }

  const base = `/${setor}/tabelas/${id}`
  const href = (c: typeof consulta, p: number = 1) => {
    const qs = serializeConsulta(c, p)
    return qs ? `${base}?${qs}` : base
  }
  const hrefsOrdem: Record<string, string> = {}
  for (const c of colunas) hrefsOrdem[c.id] = href(alternarOrdem(consulta, c.id))
  const consultaAtiva = temConsultaAtiva(consulta)
  const exportQs = serializeConsulta(consulta, 1)
  const exportarHref = `/api/tabelas/${id}/exportar${exportQs ? `?${exportQs}` : ''}`

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-4">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'linha' : 'linhas'}
        {consultaAtiva ? ' na consulta' : ''}
        {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ''}
        {podeEditar ? '' : ' · somente leitura'}
      </p>

      <BarraConsulta
        key={serializeConsulta(consulta, 1)}
        base={base}
        consulta={consulta}
        colunas={colunas}
        exportarHref={exportarHref}
      />

      {temColunaCliente && (
        <div className="flex gap-2 mb-4 text-xs">
          <Link href={href({ ...consulta, semCliente: false })}
            className={`px-3 py-1.5 rounded-lg border ${!consulta.semCliente ? 'bg-[var(--fg)]/10 border-[var(--fg)]/20 text-[var(--fg)]' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Todas
          </Link>
          <Link href={href({ ...consulta, semCliente: true })}
            className={`px-3 py-1.5 rounded-lg border ${consulta.semCliente ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Só sem cliente
          </Link>
        </div>
      )}

      {resultado.error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          Não foi possível carregar as linhas. Se acabou de atualizar o sistema, confirme que a migration 049 foi aplicada no banco.
        </div>
      )}

      <TabelaEditavel
        key={`${pagina}-${serializeConsulta(consulta, 1)}`}
        planilhaId={id}
        colunas={colunas}
        linhas={linhas}
        clientes={clientes}
        podeEditar={podeEditar}
        semCliente={consulta.semCliente}
        ordenacao={{ coluna: consulta.ordem, desc: consulta.desc, hrefs: hrefsOrdem }}
        consultaAtiva={consultaAtiva}
      />

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[var(--fg)]/50">
          {pagina > 1
            ? <Link href={href(consulta, pagina - 1)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">← Anterior</Link>
            : <span />}
          <span>Página {pagina} de {totalPaginas} · {POR_PAGINA} por página</span>
          {pagina < totalPaginas
            ? <Link href={href(consulta, pagina + 1)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">Próxima →</Link>
            : <span />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Alterar `TabelaEditavel.tsx` (3 edições)**

1. Em `import`, acrescentar `import Link from 'next/link'`.
2. Em `interface Props`, acrescentar depois de `semCliente: boolean`:
```ts
  ordenacao: { coluna: string | null; desc: boolean; hrefs: Record<string, string> }
  consultaAtiva: boolean
```
   e incluir `ordenacao, consultaAtiva` na desestruturação dos parâmetros do componente (`export default function TabelaEditavel({ ..., semCliente, ordenacao, consultaAtiva }: Props)`).
3. Trocar o contêiner e o `<thead>` existentes (a `<div className="overflow-x-auto ...">` e o bloco `<thead>...</thead>`) por:
```tsx
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {colunas.map(c => (
                <th key={c.id} aria-sort={ordenacao.coluna === c.id ? (ordenacao.desc ? 'descending' : 'ascending') : 'none'}
                  className="sticky top-0 z-10 bg-[var(--bg-surface)] text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                  <Link href={ordenacao.hrefs[c.id] ?? '#'} className="inline-flex items-center gap-1 hover:text-[var(--fg)]">
                    {c.nome}
                    <span aria-hidden="true" className="text-[var(--fg)]/40">
                      {ordenacao.coluna === c.id ? (ordenacao.desc ? '↓' : '↑') : ''}
                    </span>
                  </Link>
                </th>
              ))}
              {podeEditar && <th className="sticky top-0 z-10 bg-[var(--bg-surface)] w-10" />}
            </tr>
          </thead>
```
   (o resto da tabela, `<tbody>` e o fechamento, ficam como estão).
4. Trocar a mensagem `Nenhuma linha.` do estado vazio por `{consultaAtiva ? 'Nenhuma linha encontrada com esses filtros.' : 'Nenhuma linha.'}`.

- [ ] **Step 5: Reescrever as 5 rotas**

Para cada setor `S` em `fiscal contabil pessoal societario financeiro`, substituir `app/S/tabelas/[id]/page.tsx` por (trocar `"S"` pelo setor literal de cada diretório; erro de copiar/colar é defeito real):

```tsx
import TabelaDetalhe from '@/components/tabelas/TabelaDetalhe'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string; q?: string; filtros?: string; ordem?: string; dir?: string; semCliente?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  return <TabelaDetalhe setor="S" id={id} params={sp} />
}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas app/*/tabelas app/api/tabelas && npm test && grep -H 'setor="' app/*/tabelas/\[id\]/page.tsx`
Expected: sem erros de tipo e de lint; testes verdes; cada rota com o próprio literal de setor.

- [ ] **Step 7: Commit**

```bash
git add components/tabelas app/fiscal/tabelas app/contabil/tabelas app/pessoal/tabelas app/societario/tabelas app/financeiro/tabelas
git commit -m "feat(tabelas): busca, filtros, ordenação por cabeçalho fixo e botão de exportar"
```

---

### Task 6: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test && npx eslint components/tabelas lib/tabelas app/*/tabelas app/api/tabelas`
Expected: `tsc` limpo; todos os testes passam; lint sem erros nos arquivos novos.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/dev...HEAD`
Expected: só os arquivos da tabela "File Structure" (mais este plano). Nada fora de `components/tabelas`, `lib/tabelas`, `app/*/tabelas`, `app/api/tabelas`, `supabase/`, `tests/`, `docs/`.

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo: resumo da Fase 2B; **migration `049` pendente de aplicação manual no dev** (`supabase/migrations/049_planilhas_consulta.sql`) **e o teste de fumaça `supabase/tests/049_consultar_planilha_smoke.sql` para rodar logo depois** (deve terminar com "049 OK"); roteiro de teste manual: buscar por trecho de nome; digitar `%` e `_` na busca; filtro de número com mín/máx e de data com de/até; filtro de opções; combinar busca + filtro + "Só sem cliente"; clicar no cabeçalho 3 vezes (asc, desc, sem ordem) e ver a seta; rolar a tabela e ver o cabeçalho fixo; exportar com filtros ativos e abrir no Excel (números e datas reais, nome da aba e do arquivo); usuário de outro setor não consegue baixar (404); página inexistente `?pagina=999` cai na última. Limitações: busca diferencia acentos; exportação até 20.000 linhas. Fora do escopo: gerenciar colunas (2C). Sem merge.

- [ ] **Step 4: Avisar o usuário**

1) Aplicar `049_planilhas_consulta.sql` no dev **e em seguida rodar** `supabase/tests/049_consultar_planilha_smoke.sql` (deve mostrar "049 OK"; se falhar, mandar a mensagem do erro). 2) Testar conforme o roteiro. 3) Lembrar que 047, 048 e 049 precisam ir a produção antes da promoção dev → main.
