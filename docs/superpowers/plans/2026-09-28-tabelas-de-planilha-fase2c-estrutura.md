# Tabelas de planilha — Fase 2C (gerenciar estrutura) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a quem configura o setor um painel "Gerenciar colunas" na página de detalhe de uma tabela de planilha, para adicionar, renomear, reordenar e excluir coluna, trocar o tipo de uma coluna e renomear/excluir a tabela inteira.

**Architecture:** Segue exatamente o padrão já usado nas fases anteriores: funções SQL `SECURITY DEFINER` (migration `050`) chamadas só por Server Actions com o cliente de service role, que reautenticam e checam `podeAcessarPagina(profile, 'configuracoes', setor)` antes de qualquer escrita. A troca de tipo converte valores em TypeScript (reaproveitando `paraNumero`/`paraDataISO` já existentes), não em SQL, e manda o resultado já calculado para a função SQL — sem duplicar a regra de conversão.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19, Supabase (Postgres + RLS), Tailwind v4, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-28-tabelas-de-planilha-fase2c-estrutura-design.md`

## Global Constraints

- **Next.js diferente do treinamento:** ler o guia relevante em `node_modules/next/dist/docs/01-app/` antes de escrever rotas ou Server Components novos, conforme `AGENTS.md` do repo.
- Todas as funções SQL novas são `SECURITY DEFINER` **exceto** `contar_celulas_coluna` (só leitura, `security invoker`) — `set search_path = public`, `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`.
- `trocar_tipo_coluna_planilha` **rejeita** (`raise exception`) se o tipo atual da coluna é `cliente` ou se o tipo novo é `cliente`. A mesma checagem é feita também nas Server Actions, antes de qualquer leitura de linha.
- Valor que não converte ao trocar tipo **nunca é apagado**: mantém o texto/número original na célula, mesmo fora do tipo novo da coluna.
- Excluir coluna mostra "X de Y linhas têm valor" antes de confirmar. Excluir tabela pede digitar o nome exato da tabela para confirmar.
- Reordenar é só por botões ↑/↓ (troca de `ordem` com o vizinho), sem drag-and-drop.
- Toda Server Action nova reautentica (`getAuthenticatedAdmin`) e **nunca confia em setor vindo do cliente** — o setor é sempre lido a partir da própria tabela/coluna no banco.
- Migration `050` e o teste de fumaça SQL são aplicados/rodados **manualmente pelo usuário no dev** (nunca pelo agente contra o banco).
- Toda PR mira `dev`; nunca fazer merge. Trabalhar no worktree isolado, já criado a partir de `origin/dev`.
- `npx tsc --noEmit` tem de ficar limpo (os testes `node --test` não checam tipos).
- Texto de UI em português.

## Review Focus

1. **`moverColuna` na ponta da lista** (coluna já é a primeira e pede "cima", ou já é a última e pede "baixo") não pode gerar erro — é um no-op silencioso, sem alterar nada. *(Task 1, teste de fumaça; Task 3)*
2. **`trocarTipoColuna`/`preVisualizarTrocaTipo` chamadas com a coluna de tipo `cliente` (origem) ou pedindo trocar para `cliente` (destino)** têm de ser recusadas antes de ler qualquer linha da tabela — nunca silenciosamente ignoradas nem convertidas. *(Task 1, teste de fumaça; Task 3)*
3. **Excluir coluna numa tabela com muitas linhas** remove a chave da coluna de **todas** as linhas da tabela, não só da página carregada na tela (a UI só tem 100 linhas por página, mas a exclusão é no banco, sobre a tabela inteira). *(Task 1, teste de fumaça)*
4. **`colunaId` de uma coluna já excluída (por outra aba/pessoa, entre o carregamento da tela e o clique)** não pode derrubar a Server Action com erro cru — `contextoDaColuna` já devolve "Coluna não encontrada." nesse caso; conferir que todas as 7 ações tratam esse retorno sem exceção não capturada. *(Task 3)*
5. **Renomear coluna ou tabela não pode alterar `dados`** das linhas — a chave em `dados` é sempre o id da coluna, nunca o nome (garantia que já existe desde a Fase 1, mas fácil de quebrar sem querer numa função nova). *(Task 1, teste de fumaça)*

---

### Task 1: Migration 050 e teste SQL de fumaça

**Files:**
- Create: `supabase/migrations/050_planilhas_estrutura.sql`
- Create: `supabase/tests/050_estrutura_smoke.sql`

**Interfaces:**
- Produces: `adicionar_coluna_planilha(uuid, text, text, jsonb) returns uuid`; `renomear_coluna_planilha(uuid, text) returns boolean`; `mover_coluna_planilha(uuid, text) returns boolean`; `excluir_coluna_planilha(uuid) returns boolean`; `contar_celulas_coluna(uuid) returns table(total bigint, preenchidas bigint)`; `trocar_tipo_coluna_planilha(uuid, text, jsonb, jsonb) returns boolean`; `renomear_planilha(uuid, text) returns boolean`. Todas chamáveis via `supabase.rpc('<nome>', {...})` com os parâmetros `p_*` na ordem declarada.

- [ ] **Step 1: Confirmar que o número 050 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -2 && gh pr list --state open --json headRefName`
Expected: última migration em `origin/dev` é `048_planilhas_edicao.sql` (a Fase 2B, com a migration `049`, ainda está em PR aberto, não mergeada em `dev`) — então `050` é o próximo número livre **considerando também o PR aberto da Fase 2B**. Se `049` já tiver sido mergeada em `dev` quando você rodar isso, ou se houver outro PR aberto reservando `050`, use o próximo número livre em todo o plano (troque `050` por esse número em todos os arquivos e neste plano).

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/050_planilhas_estrutura.sql
--
-- Gerenciar estrutura de uma tabela de planilha: adicionar, renomear, mover
-- e excluir coluna; trocar o tipo de uma coluna; renomear a tabela. Só quem
-- configura o setor usa (checado nas Server Actions, não aqui).
--
-- Cuidados:
--  * Renomear coluna/tabela nunca mexe em `dados` — a chave é sempre o id da
--    coluna, nunca o nome (garantia da Fase 1).
--  * mover_coluna_planilha devolve false (sem erro) quando a coluna já está
--    na ponta e não tem vizinho pra trocar.
--  * trocar_tipo_coluna_planilha recusa coluna do tipo cliente (origem ou
--    destino) — vínculo com clientes é estrutural, não é só um texto.
--  * excluir_coluna_planilha remove a chave da coluna de TODAS as linhas da
--    tabela (não só de uma página), numa única instrução UPDATE.

create or replace function adicionar_coluna_planilha(
  p_planilha uuid,
  p_nome text,
  p_tipo text,
  p_opcoes jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  insert into planilha_colunas (planilha_id, nome, tipo, ordem, opcoes)
  select p_planilha, p_nome, p_tipo, coalesce(max(ordem), -1) + 1, p_opcoes
  from planilha_colunas
  where planilha_id = p_planilha
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function renomear_coluna_planilha(p_coluna uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilha_colunas set nome = p_nome where id = p_coluna;
  return found;
end;
$$;

create or replace function mover_coluna_planilha(p_coluna uuid, p_direcao text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planilha uuid;
  v_ordem int;
  v_vizinho_id uuid;
  v_vizinho_ordem int;
begin
  select planilha_id, ordem into v_planilha, v_ordem from planilha_colunas where id = p_coluna;
  if v_planilha is null then
    return false;
  end if;

  if p_direcao = 'cima' then
    select id, ordem into v_vizinho_id, v_vizinho_ordem
    from planilha_colunas
    where planilha_id = v_planilha and ordem < v_ordem
    order by ordem desc
    limit 1;
  elsif p_direcao = 'baixo' then
    select id, ordem into v_vizinho_id, v_vizinho_ordem
    from planilha_colunas
    where planilha_id = v_planilha and ordem > v_ordem
    order by ordem asc
    limit 1;
  else
    raise exception 'direção inválida: %', p_direcao;
  end if;

  if v_vizinho_id is null then
    return false;
  end if;

  update planilha_colunas set ordem = v_vizinho_ordem where id = p_coluna;
  update planilha_colunas set ordem = v_ordem where id = v_vizinho_id;
  return true;
end;
$$;

create or replace function excluir_coluna_planilha(p_coluna uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planilha uuid;
begin
  select planilha_id into v_planilha from planilha_colunas where id = p_coluna;
  if v_planilha is null then
    return false;
  end if;

  update planilha_linhas
     set dados = dados - p_coluna::text,
         updated_at = now()
   where planilha_id = v_planilha;

  delete from planilha_colunas where id = p_coluna;
  return true;
end;
$$;

create or replace function contar_celulas_coluna(p_coluna uuid)
returns table (total bigint, preenchidas bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) as total,
    count(*) filter (where l.dados ? p_coluna::text) as preenchidas
  from planilha_linhas l
  join planilha_colunas c on c.planilha_id = l.planilha_id
  where c.id = p_coluna
$$;

create or replace function trocar_tipo_coluna_planilha(
  p_coluna uuid,
  p_tipo text,
  p_opcoes jsonb,
  p_valores jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_atual text;
  v_item jsonb;
begin
  select tipo into v_tipo_atual from planilha_colunas where id = p_coluna;
  if v_tipo_atual is null then
    return false;
  end if;
  if v_tipo_atual = 'cliente' or p_tipo = 'cliente' then
    raise exception 'coluna do tipo cliente não pode trocar de tipo';
  end if;

  update planilha_colunas set tipo = p_tipo, opcoes = p_opcoes where id = p_coluna;

  for v_item in select * from jsonb_array_elements(coalesce(p_valores, '[]'::jsonb))
  loop
    update planilha_linhas
       set dados = jsonb_set(dados, array[p_coluna::text], coalesce(v_item->'valor', 'null'::jsonb), true),
           updated_at = now()
     where id = (v_item->>'id')::uuid;
  end loop;

  return true;
end;
$$;

create or replace function renomear_planilha(p_planilha uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilhas set nome = p_nome, updated_at = now() where id = p_planilha;
  return found;
end;
$$;

revoke all on function adicionar_coluna_planilha(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function renomear_coluna_planilha(uuid, text) from public, anon, authenticated;
revoke all on function mover_coluna_planilha(uuid, text) from public, anon, authenticated;
revoke all on function excluir_coluna_planilha(uuid) from public, anon, authenticated;
revoke all on function contar_celulas_coluna(uuid) from public, anon, authenticated;
revoke all on function trocar_tipo_coluna_planilha(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function renomear_planilha(uuid, text) from public, anon, authenticated;

grant execute on function adicionar_coluna_planilha(uuid, text, text, jsonb) to service_role;
grant execute on function renomear_coluna_planilha(uuid, text) to service_role;
grant execute on function mover_coluna_planilha(uuid, text) to service_role;
grant execute on function excluir_coluna_planilha(uuid) to service_role;
grant execute on function contar_celulas_coluna(uuid) to service_role;
grant execute on function trocar_tipo_coluna_planilha(uuid, text, jsonb, jsonb) to service_role;
grant execute on function renomear_planilha(uuid, text) to service_role;
```

- [ ] **Step 3: Escrever o teste de fumaça em SQL**

O ambiente do agente não tem banco; este arquivo é para o **usuário** colar no SQL Editor do Supabase de **dev**. Cria dados de teste dentro de uma transação, roda asserts, e faz `rollback` (nada fica no banco).

```sql
-- supabase/tests/050_estrutura_smoke.sql
--
-- Teste de fumaça das funções de estrutura (migration 050). Rodar SÓ no dev,
-- no SQL Editor. Cria uma tabela de teste, roda asserts e desfaz tudo
-- (rollback). Sucesso = aparece a mensagem "050 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  c_c uuid := gen_random_uuid();
  c_cliente uuid := gen_random_uuid();
  v_nova uuid;
  v_ok boolean;
  v_tipo text;
  v_ordem_a int;
  v_ordem_b int;
  v_total bigint;
  v_preenchidas bigint;
  v_dados jsonb;
  v_erro_capturado boolean := false;
begin
  insert into planilhas (id, setor, nome) values (v_pl, 'fiscal', 'smoke 050');
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_a, v_pl, 'Coluna A', 'texto', 0, null),
    (c_b, v_pl, 'Coluna B', 'texto', 1, null),
    (c_c, v_pl, 'Coluna C', 'texto', 2, null),
    (c_cliente, v_pl, 'Cliente', 'cliente', 3, null);

  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 0, jsonb_build_object(c_a::text, '10', c_b::text, 'abc')),
    (v_pl, 1, jsonb_build_object(c_a::text, '20'));

  -- 1) adicionar coluna: entra no fim (ordem 4)
  select adicionar_coluna_planilha(v_pl, 'Coluna Nova', 'numero', null) into v_nova;
  assert v_nova is not null, 'adicionar coluna deveria devolver um id';
  perform 1 from planilha_colunas where id = v_nova and ordem = 4;
  assert found, 'coluna nova deveria ter ordem 4';

  -- 2) renomear coluna: não mexe em dados
  select renomear_coluna_planilha(c_a, 'Coluna A renomeada') into v_ok;
  assert v_ok, 'renomear deveria devolver true';
  select dados into v_dados from planilha_linhas where planilha_id = v_pl and ordem = 0;
  assert v_dados ->> c_a::text = '10', 'renomear coluna não deveria mexer em dados: ' || v_dados::text;

  -- 3) mover coluna: c_b sobe (troca ordem com c_a)
  select ordem into v_ordem_a from planilha_colunas where id = c_a;
  select ordem into v_ordem_b from planilha_colunas where id = c_b;
  select mover_coluna_planilha(c_b, 'cima') into v_ok;
  assert v_ok, 'mover cima deveria devolver true';
  perform 1 from planilha_colunas where id = c_b and ordem = v_ordem_a;
  assert found, 'c_b deveria ter assumido a ordem de c_a';
  perform 1 from planilha_colunas where id = c_a and ordem = v_ordem_b;
  assert found, 'c_a deveria ter assumido a ordem de c_b';

  -- 4) mover na ponta: primeira coluna pedindo "cima" devolve false, sem erro
  select mover_coluna_planilha(c_b, 'cima') into v_ok;
  assert v_ok = false, 'mover a primeira coluna pra cima deveria devolver false';

  -- 5) contar células da coluna A: 2 linhas no total, 2 preenchidas
  select total, preenchidas into v_total, v_preenchidas from contar_celulas_coluna(c_a);
  assert v_total = 2 and v_preenchidas = 2, 'contagem coluna A: total=' || v_total || ' preenchidas=' || v_preenchidas;

  -- 6) contar células da coluna B: 2 linhas no total, 1 preenchida
  select total, preenchidas into v_total, v_preenchidas from contar_celulas_coluna(c_b);
  assert v_total = 2 and v_preenchidas = 1, 'contagem coluna B: total=' || v_total || ' preenchidas=' || v_preenchidas;

  -- 7) trocar tipo da coluna C (texto -> numero) com valores já convertidos
  select trocar_tipo_coluna_planilha(
    c_c, 'numero', null,
    jsonb_build_array()
  ) into v_ok;
  assert v_ok, 'trocar tipo deveria devolver true';
  select tipo into v_tipo from planilha_colunas where id = c_c;
  assert v_tipo = 'numero', 'coluna C deveria estar com tipo numero, veio ' || v_tipo;

  -- 8) trocar tipo recusa coluna cliente (origem)
  begin
    perform trocar_tipo_coluna_planilha(c_cliente, 'texto', null, '[]'::jsonb);
    v_erro_capturado := false;
  exception when others then
    v_erro_capturado := true;
  end;
  assert v_erro_capturado, 'trocar tipo da coluna cliente deveria levantar erro';

  -- 9) trocar tipo recusa tipo cliente como destino
  begin
    perform trocar_tipo_coluna_planilha(c_a, 'cliente', null, '[]'::jsonb);
    v_erro_capturado := false;
  exception when others then
    v_erro_capturado := true;
  end;
  assert v_erro_capturado, 'trocar tipo para cliente deveria levantar erro';

  -- 10) excluir coluna A: some de TODAS as linhas, não só de uma
  select excluir_coluna_planilha(c_a) into v_ok;
  assert v_ok, 'excluir coluna deveria devolver true';
  perform 1 from planilha_linhas where planilha_id = v_pl and dados ? c_a::text;
  assert not found, 'coluna A ainda aparece em alguma linha depois de excluída';
  perform 1 from planilha_colunas where id = c_a;
  assert not found, 'coluna A ainda existe em planilha_colunas depois de excluída';

  -- 11) renomear planilha
  select renomear_planilha(v_pl, 'smoke 050 renomeada') into v_ok;
  assert v_ok, 'renomear planilha deveria devolver true';
  perform 1 from planilhas where id = v_pl and nome = 'smoke 050 renomeada';
  assert found, 'nome da planilha não foi atualizado';

  raise notice '050 OK';
end $$;

rollback;
select '050 OK (dados de teste desfeitos com rollback)' as resultado;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/050_planilhas_estrutura.sql supabase/tests/050_estrutura_smoke.sql
git commit -m "feat(tabelas): migration 050 com funções de estrutura e teste SQL de fumaça"
```

---

### Task 2: Conversão pura ao trocar tipo (`lib/tabelas/trocar-tipo.ts`)

**Files:**
- Create: `lib/tabelas/trocar-tipo.ts`
- Test: `tests/tabelas-trocar-tipo.test.ts`

**Interfaces:**
- Consumes: `paraNumero`, `paraDataISO` de `./tipos`; `TipoColuna`, `OpcaoColuna`, `ValorCelula` de `./tipos`.
- Produces:
  - `interface LinhaValor { id: string; valorAtual: ValorCelula }`
  - `interface ValorConvertido { id: string; valor: ValorCelula }`
  - `interface ResultadoTrocaTipo { convertidas: number; naoConvertidas: number; valores: ValorConvertido[] }`
  - `prepararTrocaTipo(linhas: LinhaValor[], tipoNovo: TipoColuna, opcoesNovas: OpcaoColuna[] | null): ResultadoTrocaTipo`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-trocar-tipo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepararTrocaTipo } from '../lib/tabelas/trocar-tipo'

test('texto para número: converte o que dá, mantém o que não dá', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: '10' },
      { id: 'b', valorAtual: '1.234,5' },
      { id: 'c', valorAtual: 'abc' },
      { id: 'd', valorAtual: null },
    ],
    'numero',
    null,
  )
  assert.equal(r.convertidas, 3)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: 10 },
    { id: 'b', valor: 1234.5 },
    { id: 'c', valor: 'abc' },
    { id: 'd', valor: null },
  ])
})

test('texto para data: DD/MM/AAAA converte, resto mantém o valor original', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: '15/03/2026' },
      { id: 'b', valorAtual: 'ontem' },
    ],
    'data',
    null,
  )
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: '2026-03-15' },
    { id: 'b', valor: 'ontem' },
  ])
})

test('número para texto: sempre converte, vira string', () => {
  const r = prepararTrocaTipo([{ id: 'a', valorAtual: 42 }], 'texto', null)
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.valores, [{ id: 'a', valor: '42' }])
})

test('qualquer tipo para opções: só bate se o valor já é uma das opções novas', () => {
  const opcoes = [{ valor: 'Feito', cor: '#10b981' }, { valor: 'Pendente', cor: '#f59e0b' }]
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: 'Feito' },
      { id: 'b', valorAtual: 'Cancelado' },
    ],
    'opcoes',
    opcoes,
  )
  assert.equal(r.convertidas, 1)
  assert.equal(r.naoConvertidas, 1)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: 'Feito' },
    { id: 'b', valor: 'Cancelado' },
  ])
})

test('célula vazia ou nula nunca conta como falha de conversão', () => {
  const r = prepararTrocaTipo(
    [
      { id: 'a', valorAtual: null },
      { id: 'b', valorAtual: '' },
      { id: 'c', valorAtual: '   ' },
    ],
    'numero',
    null,
  )
  assert.equal(r.convertidas, 3)
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.valores, [
    { id: 'a', valor: null },
    { id: 'b', valor: null },
    { id: 'c', valor: null },
  ])
})

test('tabela vazia devolve zero em tudo', () => {
  const r = prepararTrocaTipo([], 'numero', null)
  assert.deepEqual(r, { convertidas: 0, naoConvertidas: 0, valores: [] })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-trocar-tipo.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/trocar-tipo.ts
import { paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export interface LinhaValor { id: string; valorAtual: ValorCelula }
export interface ValorConvertido { id: string; valor: ValorCelula }
export interface ResultadoTrocaTipo {
  convertidas: number
  naoConvertidas: number
  valores: ValorConvertido[]
}

// Converte o valor atual de uma célula pro tipo novo. NUNCA apaga: o que não
// converte continua exatamente como estava, mesmo que isso deixe a célula
// com um valor "fora do tipo" da coluna (igual já acontece na importação,
// Fase 1). Célula vazia/nula sempre "converte" pra null, nunca conta como
// falha.
function converterValor(
  valorAtual: ValorCelula,
  tipoNovo: TipoColuna,
  opcoesNovas: OpcaoColuna[] | null,
): { valor: ValorCelula; convertida: boolean } {
  if (valorAtual === null) return { valor: null, convertida: true }
  const texto = String(valorAtual).trim()
  if (texto === '') return { valor: null, convertida: true }

  switch (tipoNovo) {
    case 'texto':
      return { valor: texto, convertida: true }
    case 'numero': {
      const n = paraNumero(valorAtual)
      return n === null ? { valor: valorAtual, convertida: false } : { valor: n, convertida: true }
    }
    case 'data': {
      const d = paraDataISO(valorAtual)
      return d === null ? { valor: valorAtual, convertida: false } : { valor: d, convertida: true }
    }
    case 'opcoes': {
      const bate = (opcoesNovas ?? []).some(o => o.valor === texto)
      return bate ? { valor: texto, convertida: true } : { valor: valorAtual, convertida: false }
    }
    default:
      return { valor: valorAtual, convertida: false }
  }
}

export function prepararTrocaTipo(
  linhas: LinhaValor[],
  tipoNovo: TipoColuna,
  opcoesNovas: OpcaoColuna[] | null,
): ResultadoTrocaTipo {
  let convertidas = 0
  let naoConvertidas = 0
  const valores: ValorConvertido[] = []

  for (const linha of linhas) {
    const { valor, convertida } = converterValor(linha.valorAtual, tipoNovo, opcoesNovas)
    if (convertida) convertidas++
    else naoConvertidas++
    valores.push({ id: linha.id, valor })
  }

  return { convertidas, naoConvertidas, valores }
}
```

- [ ] **Step 4: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/tabelas-trocar-tipo.test.ts && npx tsc --noEmit`
Expected: PASS (6 testes) e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/trocar-tipo.ts tests/tabelas-trocar-tipo.test.ts
git commit -m "feat(tabelas): conversão pura ao trocar o tipo de uma coluna"
```

---

### Task 3: Server Actions de estrutura (`lib/tabelas-estrutura-actions.ts`)

**Files:**
- Create: `lib/tabelas-estrutura-actions.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAdmin` de `./supabase/server`; `podeAcessarPagina` de `./route-permissions`; `ehUuid` de `./tabelas/editar-celula`; `prepararTrocaTipo`, `type LinhaValor`, `type ValorConvertido` de `./tabelas/trocar-tipo`; `SetorTabela` de `./tabelas/montar-payload`; `OpcaoColuna`, `TipoColuna`, `ValorCelula` de `./tabelas/tipos`. Chama as RPCs da Task 1: `adicionar_coluna_planilha`, `renomear_coluna_planilha`, `mover_coluna_planilha`, `excluir_coluna_planilha`, `contar_celulas_coluna`, `trocar_tipo_coluna_planilha`, `renomear_planilha`.
- Produces:
  - `adicionarColuna(entrada: { planilhaId: string; nome: string; tipo: TipoColuna; opcoes?: OpcaoColuna[] | null }): Promise<{ error: string | null; id?: string }>`
  - `renomearColuna(entrada: { colunaId: string; nome: string }): Promise<{ error: string | null }>`
  - `moverColuna(entrada: { colunaId: string; direcao: 'cima' | 'baixo' }): Promise<{ error: string | null }>`
  - `preVisualizarExclusaoColuna(colunaId: string): Promise<{ error: string | null; total?: number; preenchidas?: number }>`
  - `excluirColuna(colunaId: string): Promise<{ error: string | null }>`
  - `preVisualizarTrocaTipo(entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas?: OpcaoColuna[] | null }): Promise<{ error: string | null; convertidas?: number; naoConvertidas?: number; valores?: ValorConvertido[] }>`
  - `trocarTipoColuna(entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas: OpcaoColuna[] | null; valores: ValorConvertido[] }): Promise<{ error: string | null }>`
  - `renomearTabela(entrada: { planilhaId: string; nome: string }): Promise<{ error: string | null }>`
  - `excluirTabela(entrada: { planilhaId: string; nomeConfirmacao: string }): Promise<{ error: string | null; setor?: SetorTabela }>`

- [ ] **Step 1: Ler o padrão existente**

Run: `sed -n 1,60p lib/tabelas-edicao-actions.ts`
Expected: confirmar o padrão de `contextoDaPlanilha`/`contextoDaLinha`/`colunaDaTabela`/`revalidarTabela` já usado na Fase 2A — o arquivo novo segue a mesma forma, trocando a checagem de permissão de `podeEditarLinhas` para `podeAcessarPagina(profile, 'configuracoes', setor)` (mesma regra já usada em `criarPlanilha`, `lib/tabelas-actions.ts:21`).

- [ ] **Step 2: Implementar**

```ts
// lib/tabelas-estrutura-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { ehUuid } from './tabelas/editar-celula'
import { prepararTrocaTipo, type LinhaValor, type ValorConvertido } from './tabelas/trocar-tipo'
import type { SetorTabela } from './tabelas/montar-payload'
import type { OpcaoColuna, TipoColuna, ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; nome: string; setor: SetorTabela }
type ContextoColuna =
  | { error: string }
  | { error: null; supabase: Admin; planilhaId: string; nome: string; setor: SetorTabela; colunaId: string }

const TIPOS_VALIDOS: TipoColuna[] = ['texto', 'numero', 'data', 'opcoes', 'cliente']
const MAX_NOME = 120

function validarNome(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  const t = nome.trim()
  return t === '' || t.length > MAX_NOME ? null : t
}

// Sessão + tabela + permissão de QUEM CONFIGURA o setor (não quem só edita
// linhas). NUNCA confia em setor vindo do cliente: lido sempre da tabela.
async function contextoConfig(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', planilha.setor as SetorTabela)) return { error: 'Acesso negado.' }

  return { error: null, supabase, planilhaId: planilha.id as string, nome: planilha.nome as string, setor: planilha.setor as SetorTabela }
}

async function contextoDaColuna(colunaId: string): Promise<ContextoColuna> {
  if (!ehUuid(colunaId)) return { error: 'Coluna inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }
  const { data: coluna } = await supabase.from('planilha_colunas').select('id, planilha_id').eq('id', colunaId).maybeSingle()
  if (!coluna) return { error: 'Coluna não encontrada.' }
  const ctx = await contextoConfig(coluna.planilha_id as string)
  if (ctx.error !== null) return ctx
  return { ...ctx, colunaId: coluna.id as string }
}

interface ColunaDB { id: string; planilha_id: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

// Busca tipo/opções da coluna pra checar a regra "cliente não troca de tipo".
// planilhaId aqui já veio de contextoDaColuna (derivado da própria coluna),
// então o `data.planilha_id !== planilhaId` é sempre verdadeiro por
// construção — a checagem fica como defesa em profundidade, barata e sem
// custo de manutenção.
async function colunaDaTabela(supabase: Admin, colunaId: string, planilhaId: string): Promise<ColunaDB | null> {
  const { data } = await supabase.from('planilha_colunas').select('id, planilha_id, tipo, opcoes').eq('id', colunaId).maybeSingle()
  if (!data || data.planilha_id !== planilhaId) return null
  return data as ColunaDB
}

function revalidarTabela(ctx: { setor: SetorTabela; planilhaId: string }) {
  revalidatePath(`/${ctx.setor}/tabelas/${ctx.planilhaId}`)
}

export async function adicionarColuna(
  entrada: { planilhaId: string; nome: string; tipo: TipoColuna; opcoes?: OpcaoColuna[] | null },
): Promise<{ error: string | null; id?: string }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }
  if (!TIPOS_VALIDOS.includes(entrada.tipo)) return { error: 'Tipo inválido.' }
  const opcoes = entrada.tipo === 'opcoes' ? (entrada.opcoes ?? null) : null

  const { data, error } = await ctx.supabase.rpc('adicionar_coluna_planilha', {
    p_planilha: ctx.planilhaId,
    p_nome: nome,
    p_tipo: entrada.tipo,
    p_opcoes: opcoes,
  })
  if (error || !data) return { error: 'Não foi possível adicionar a coluna.' }
  revalidarTabela(ctx)
  return { error: null, id: data as string }
}

export async function renomearColuna(
  entrada: { colunaId: string; nome: string },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }

  const { error } = await ctx.supabase.rpc('renomear_coluna_planilha', { p_coluna: ctx.colunaId, p_nome: nome })
  if (error) return { error: 'Não foi possível renomear a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function moverColuna(
  entrada: { colunaId: string; direcao: 'cima' | 'baixo' },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (entrada.direcao !== 'cima' && entrada.direcao !== 'baixo') return { error: 'Direção inválida.' }

  const { error } = await ctx.supabase.rpc('mover_coluna_planilha', { p_coluna: ctx.colunaId, p_direcao: entrada.direcao })
  if (error) return { error: 'Não foi possível mover a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function preVisualizarExclusaoColuna(
  colunaId: string,
): Promise<{ error: string | null; total?: number; preenchidas?: number }> {
  const ctx = await contextoDaColuna(colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('contar_celulas_coluna', { p_coluna: ctx.colunaId })
  if (error || !data || data.length === 0) return { error: 'Não foi possível calcular o impacto.' }
  return { error: null, total: Number(data[0].total), preenchidas: Number(data[0].preenchidas) }
}

export async function excluirColuna(colunaId: string): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(colunaId)
  if (ctx.error !== null) return { error: ctx.error }

  const { data, error } = await ctx.supabase.rpc('excluir_coluna_planilha', { p_coluna: ctx.colunaId })
  if (error || !data) return { error: 'Não foi possível excluir a coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function preVisualizarTrocaTipo(
  entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas?: OpcaoColuna[] | null },
): Promise<{ error: string | null; convertidas?: number; naoConvertidas?: number; valores?: ValorConvertido[] }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (!TIPOS_VALIDOS.includes(entrada.tipoNovo)) return { error: 'Tipo inválido.' }

  const coluna = await colunaDaTabela(ctx.supabase, ctx.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }
  if (coluna.tipo === 'cliente' || entrada.tipoNovo === 'cliente') {
    return { error: 'Coluna do tipo Cliente não pode trocar de tipo.' }
  }

  const { data: linhasRaw, error } = await ctx.supabase
    .from('planilha_linhas').select('id, dados').eq('planilha_id', ctx.planilhaId)
  if (error) return { error: 'Não foi possível ler as linhas da tabela.' }

  const linhas: LinhaValor[] = (linhasRaw ?? []).map(l => ({
    id: l.id as string,
    valorAtual: (l.dados as Record<string, ValorCelula>)[ctx.colunaId] ?? null,
  }))

  const opcoesNovas = entrada.tipoNovo === 'opcoes' ? (entrada.opcoesNovas ?? null) : null
  const resultado = prepararTrocaTipo(linhas, entrada.tipoNovo, opcoesNovas)
  return { error: null, ...resultado }
}

export async function trocarTipoColuna(
  entrada: { colunaId: string; tipoNovo: TipoColuna; opcoesNovas: OpcaoColuna[] | null; valores: ValorConvertido[] },
): Promise<{ error: string | null }> {
  const ctx = await contextoDaColuna(entrada?.colunaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (!TIPOS_VALIDOS.includes(entrada.tipoNovo)) return { error: 'Tipo inválido.' }

  const coluna = await colunaDaTabela(ctx.supabase, ctx.colunaId, ctx.planilhaId)
  if (!coluna) return { error: 'Coluna inválida.' }
  if (coluna.tipo === 'cliente' || entrada.tipoNovo === 'cliente') {
    return { error: 'Coluna do tipo Cliente não pode trocar de tipo.' }
  }
  if (!Array.isArray(entrada.valores)) return { error: 'Dados de conversão inválidos.' }

  const { error } = await ctx.supabase.rpc('trocar_tipo_coluna_planilha', {
    p_coluna: ctx.colunaId,
    p_tipo: entrada.tipoNovo,
    p_opcoes: entrada.tipoNovo === 'opcoes' ? entrada.opcoesNovas : null,
    p_valores: entrada.valores,
  })
  if (error) return { error: 'Não foi possível trocar o tipo da coluna.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function renomearTabela(
  entrada: { planilhaId: string; nome: string },
): Promise<{ error: string | null }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  const nome = validarNome(entrada.nome)
  if (!nome) return { error: 'Nome inválido.' }

  const { error } = await ctx.supabase.rpc('renomear_planilha', { p_planilha: ctx.planilhaId, p_nome: nome })
  if (error) return { error: 'Não foi possível renomear a tabela.' }
  revalidarTabela(ctx)
  return { error: null }
}

export async function excluirTabela(
  entrada: { planilhaId: string; nomeConfirmacao: string },
): Promise<{ error: string | null; setor?: SetorTabela }> {
  const ctx = await contextoConfig(entrada?.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }

  if (typeof entrada.nomeConfirmacao !== 'string' || entrada.nomeConfirmacao.trim() !== ctx.nome) {
    return { error: 'O nome digitado não confere com o nome da tabela.' }
  }

  const { error } = await ctx.supabase.from('planilhas').delete().eq('id', ctx.planilhaId)
  if (error) return { error: 'Não foi possível excluir a tabela.' }
  revalidatePath(`/${ctx.setor}/tabelas`)
  return { error: null, setor: ctx.setor }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint lib/tabelas-estrutura-actions.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/tabelas-estrutura-actions.ts
git commit -m "feat(tabelas): Server Actions de estrutura (colunas e tabela)"
```

---

### Task 4: Painel "Gerenciar colunas" e integração na página

**Files:**
- Create: `components/tabelas/GerenciarEstrutura.tsx`
- Modify: `components/tabelas/TabelaDetalhe.tsx`

**Interfaces:**
- Consumes: `adicionarColuna`, `renomearColuna`, `moverColuna`, `preVisualizarExclusaoColuna`, `excluirColuna`, `preVisualizarTrocaTipo`, `trocarTipoColuna`, `renomearTabela`, `excluirTabela` de `@/lib/tabelas-estrutura-actions`; `TIPOS_COLUNA`, `TipoColuna`, `OpcaoColuna`, `opcoesDosValores` de `@/lib/tabelas/tipos`.
- Produces: `GerenciarEstrutura({ planilhaId, nome, setor, colunas }: { planilhaId: string; nome: string; setor: SetorTabela; colunas: { id: string; nome: string; tipo: TipoColuna }[] })` — componente client autocontido (botão + painel), sem props de callback: usa `useRouter().refresh()` depois de cada mutação, igual ao padrão de `ClienteAcoes.tsx`.

- [ ] **Step 1: Ler o padrão de modal existente**

Run: `sed -n 1,70p components/fiscal/ClienteAcoes.tsx && sed -n 1,70p components/fiscal/GerenciarSecoesModal.tsx`
Expected: confirmar o formato do backdrop (`fixed inset-0 z-[60] ... bg-black/70`), do card (`bg-[var(--bg-surface)] border ... rounded-2xl`), e do fluxo de "digitar nome pra confirmar exclusão" (`ClienteAcoes.tsx`, comparação com `.trim()`).

- [ ] **Step 2: Criar `GerenciarEstrutura.tsx`**

```tsx
// components/tabelas/GerenciarEstrutura.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarColuna, renomearColuna, moverColuna, preVisualizarExclusaoColuna, excluirColuna,
  preVisualizarTrocaTipo, trocarTipoColuna, renomearTabela, excluirTabela,
} from '@/lib/tabelas-estrutura-actions'
import { TIPOS_COLUNA, opcoesDosValores, type TipoColuna, type OpcaoColuna } from '@/lib/tabelas/tipos'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ValorConvertido } from '@/lib/tabelas/trocar-tipo'

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}
const TIPOS_TROCAVEIS = TIPOS_COLUNA.filter(t => t !== 'cliente')

interface ColunaResumo { id: string; nome: string; tipo: TipoColuna }
interface Props { planilhaId: string; nome: string; setor: SetorTabela; colunas: ColunaResumo[] }

const inputCls = 'px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'
const btnCls = 'px-3 py-1.5 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-xs'

export default function GerenciarEstrutura({ planilhaId, nome, setor, colunas }: Props) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [nomeTabela, setNomeTabela] = useState(nome)
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoColuna>('texto')
  const [novasOpcoesTexto, setNovasOpcoesTexto] = useState('')

  const [colunaExcluindo, setColunaExcluindo] = useState<ColunaResumo | null>(null)
  const [previaExclusao, setPreviaExclusao] = useState<{ total: number; preenchidas: number } | null>(null)

  const [colunaTrocando, setColunaTrocando] = useState<ColunaResumo | null>(null)
  const [tipoAlvo, setTipoAlvo] = useState<TipoColuna>('texto')
  const [opcoesAlvoTexto, setOpcoesAlvoTexto] = useState('')
  const [previaTroca, setPreviaTroca] = useState<{ convertidas: number; naoConvertidas: number; valores: ValorConvertido[] } | null>(null)

  const [confirmandoExclusaoTabela, setConfirmandoExclusaoTabela] = useState(false)
  const [nomeDigitado, setNomeDigitado] = useState('')

  function fechar() {
    setAberto(false)
    setErro(null)
    setColunaExcluindo(null)
    setPreviaExclusao(null)
    setColunaTrocando(null)
    setPreviaTroca(null)
    setConfirmandoExclusaoTabela(false)
    setNomeDigitado('')
  }

  function parseOpcoes(texto: string): OpcaoColuna[] {
    const valores = texto.split('\n').map(v => v.trim()).filter(v => v !== '')
    return opcoesDosValores(valores)
  }

  async function salvarNomeTabela() {
    if (nomeTabela.trim() === nome || nomeTabela.trim() === '') { setNomeTabela(nome); return }
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearTabela({ planilhaId, nome: nomeTabela })
      if (error) { setErro(error); setNomeTabela(nome); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function salvarNomeColuna(coluna: ColunaResumo, nomeNovo: string) {
    if (nomeNovo.trim() === coluna.nome || nomeNovo.trim() === '') return
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearColuna({ colunaId: coluna.id, nome: nomeNovo })
      if (error) { setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function mover(coluna: ColunaResumo, direcao: 'cima' | 'baixo') {
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await moverColuna({ colunaId: coluna.id, direcao })
      if (error) { setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function adicionar() {
    const nomeValido = novoNome.trim()
    if (nomeValido === '') { setErro('Digite um nome pra coluna nova.'); return }
    setErro(null)
    setOcupado(true)
    try {
      const opcoes = novoTipo === 'opcoes' ? parseOpcoes(novasOpcoesTexto) : null
      const { error } = await adicionarColuna({ planilhaId, nome: nomeValido, tipo: novoTipo, opcoes })
      if (error) { setErro(error); return }
      setNovoNome(''); setNovoTipo('texto'); setNovasOpcoesTexto('')
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirExclusaoColuna(coluna: ColunaResumo) {
    setErro(null)
    setColunaExcluindo(coluna)
    setPreviaExclusao(null)
    const { error, total, preenchidas } = await preVisualizarExclusaoColuna(coluna.id)
    if (error) { setErro(error); setColunaExcluindo(null); return }
    setPreviaExclusao({ total: total ?? 0, preenchidas: preenchidas ?? 0 })
  }

  async function confirmarExclusaoColuna() {
    if (!colunaExcluindo) return
    setOcupado(true)
    try {
      const { error } = await excluirColuna(colunaExcluindo.id)
      if (error) { setErro(error); return }
      setColunaExcluindo(null)
      setPreviaExclusao(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirTrocaTipo(coluna: ColunaResumo) {
    setErro(null)
    setColunaTrocando(coluna)
    setTipoAlvo(coluna.tipo === 'cliente' ? 'texto' : coluna.tipo)
    setOpcoesAlvoTexto('')
    setPreviaTroca(null)
  }

  async function calcularPreviaTroca() {
    if (!colunaTrocando) return
    setErro(null)
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error, convertidas, naoConvertidas, valores } = await preVisualizarTrocaTipo({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas,
      })
      if (error) { setErro(error); return }
      setPreviaTroca({ convertidas: convertidas ?? 0, naoConvertidas: naoConvertidas ?? 0, valores: valores ?? [] })
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarTrocaTipo() {
    if (!colunaTrocando || !previaTroca) return
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error } = await trocarTipoColuna({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas, valores: previaTroca.valores,
      })
      if (error) { setErro(error); return }
      setColunaTrocando(null)
      setPreviaTroca(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarExclusaoTabela() {
    setOcupado(true)
    try {
      const { error } = await excluirTabela({ planilhaId, nomeConfirmacao: nomeDigitado })
      if (error) { setErro(error); return }
      router.push(`/${setor}/tabelas`)
    } finally {
      setOcupado(false)
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className={btnCls}>Gerenciar colunas</button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Gerenciar colunas</h2>
          <button onClick={fechar} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{erro}</div>}

          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Nome da tabela</label>
            <input className={`${inputCls} w-full`} value={nomeTabela} maxLength={120}
              onChange={e => setNomeTabela(e.target.value)} onBlur={salvarNomeTabela} disabled={ocupado} />
          </div>

          <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8">
            {colunas.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <input className={`${inputCls} flex-1 min-w-[8rem]`} defaultValue={c.nome} maxLength={120}
                  onBlur={e => salvarNomeColuna(c, e.target.value)} disabled={ocupado} />
                <span className="text-xs text-[var(--fg)]/50 min-w-[5rem]">{ROTULO_TIPO[c.tipo]}</span>
                <button className={btnCls} disabled={ocupado || i === 0} onClick={() => mover(c, 'cima')}>↑</button>
                <button className={btnCls} disabled={ocupado || i === colunas.length - 1} onClick={() => mover(c, 'baixo')}>↓</button>
                {c.tipo !== 'cliente' && (
                  <button className={btnCls} disabled={ocupado} onClick={() => abrirTrocaTipo(c)}>Trocar tipo</button>
                )}
                <button className={`${btnCls} text-red-400 border-red-500/20 hover:text-red-300`} disabled={ocupado}
                  onClick={() => abrirExclusaoColuna(c)}>Excluir</button>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest">Adicionar coluna</label>
            <div className="flex flex-wrap gap-2">
              <input className={`${inputCls} flex-1 min-w-[10rem]`} placeholder="Nome da coluna" value={novoNome}
                maxLength={120} onChange={e => setNovoNome(e.target.value)} />
              <select className={inputCls} value={novoTipo} onChange={e => setNovoTipo(e.target.value as TipoColuna)}>
                {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
              </select>
              <button className={btnCls} disabled={ocupado} onClick={adicionar}>Adicionar</button>
            </div>
            {novoTipo === 'opcoes' && (
              <textarea className={`${inputCls} w-full`} rows={3} placeholder="Uma opção por linha"
                value={novasOpcoesTexto} onChange={e => setNovasOpcoesTexto(e.target.value)} />
            )}
          </div>

          {colunaExcluindo && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <p className="text-sm text-[var(--fg)]">Excluir a coluna "{colunaExcluindo.nome}"?</p>
              {previaExclusao
                ? <p className="text-xs text-[var(--fg)]/60">{previaExclusao.preenchidas} de {previaExclusao.total} linhas têm valor nessa coluna. Isso não pode ser desfeito.</p>
                : <p className="text-xs text-[var(--fg)]/40">Calculando impacto…</p>}
              <div className="flex gap-2">
                <button className={`${btnCls} text-red-400 border-red-500/30`} disabled={ocupado || !previaExclusao}
                  onClick={confirmarExclusaoColuna}>Confirmar exclusão</button>
                <button className={btnCls} disabled={ocupado} onClick={() => { setColunaExcluindo(null); setPreviaExclusao(null) }}>Cancelar</button>
              </div>
            </div>
          )}

          {colunaTrocando && (
            <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
              <p className="text-sm text-[var(--fg)]">Trocar o tipo de "{colunaTrocando.nome}"</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select className={inputCls} value={tipoAlvo}
                  onChange={e => { setTipoAlvo(e.target.value as TipoColuna); setPreviaTroca(null) }}>
                  {TIPOS_TROCAVEIS.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                </select>
                <button className={btnCls} disabled={ocupado} onClick={calcularPreviaTroca}>Calcular</button>
              </div>
              {tipoAlvo === 'opcoes' && (
                <textarea className={`${inputCls} w-full`} rows={3} placeholder="Uma opção por linha"
                  value={opcoesAlvoTexto} onChange={e => { setOpcoesAlvoTexto(e.target.value); setPreviaTroca(null) }} />
              )}
              {previaTroca && (
                <p className="text-xs text-[var(--fg)]/60">
                  {previaTroca.convertidas} célula(s) convertem. {previaTroca.naoConvertidas > 0
                    ? `${previaTroca.naoConvertidas} não convertem e ficam como estão (o valor original não é apagado).`
                    : ''}
                </p>
              )}
              <div className="flex gap-2">
                <button className={btnCls} disabled={ocupado || !previaTroca} onClick={confirmarTrocaTipo}>Confirmar troca</button>
                <button className={btnCls} disabled={ocupado} onClick={() => { setColunaTrocando(null); setPreviaTroca(null) }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-red-500/30 p-4">
            {!confirmandoExclusaoTabela ? (
              <button className={`${btnCls} text-red-400 border-red-500/30`} onClick={() => setConfirmandoExclusaoTabela(true)}>
                Excluir tabela
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-[var(--fg)]">Isso apaga a tabela "{nome}" e todas as linhas dela, sem volta. Digite o nome exato pra confirmar:</p>
                <input className={`${inputCls} w-full`} value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />
                <div className="flex gap-2">
                  <button className={`${btnCls} text-red-400 border-red-500/30`}
                    disabled={ocupado || nomeDigitado.trim() !== nome} onClick={confirmarExclusaoTabela}>
                    Excluir definitivamente
                  </button>
                  <button className={btnCls} disabled={ocupado} onClick={() => { setConfirmandoExclusaoTabela(false); setNomeDigitado('') }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Ligar em `TabelaDetalhe.tsx`**

1. No topo do arquivo, acrescentar aos imports:
```ts
import { podeAcessarPagina } from '@/lib/route-permissions'
import GerenciarEstrutura from './GerenciarEstrutura'
```
2. Trocar a linha (dentro do `Promise.all`) `supabase.from('profiles').select('role, setores').eq('id', user.id).single()` por:
```ts
supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single(),
```
3. Logo depois de `const podeEditar = podeEditarLinhas(profile, setor)`, acrescentar:
```ts
  const podeConfigurar = podeAcessarPagina(profile, 'configuracoes', setor)
```
4. No cabeçalho (dentro do `<div className="p-8">`, logo depois do `<h1>`), trocar:
```tsx
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
```
por:
```tsx
      <div className="flex items-center justify-between gap-3 mt-2">
        <h1 className="text-2xl font-bold text-[var(--fg)]">{planilha.nome}</h1>
        {podeConfigurar && (
          <GerenciarEstrutura planilhaId={id} nome={planilha.nome} setor={setor} colunas={colunas} />
        )}
      </div>
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas app/*/tabelas && npm test`
Expected: sem erros de tipo e de lint; testes verdes.

- [ ] **Step 5: Commit**

```bash
git add components/tabelas/GerenciarEstrutura.tsx components/tabelas/TabelaDetalhe.tsx
git commit -m "feat(tabelas): painel de gerenciar colunas e integração na página da tabela"
```

---

### Task 5: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test && npx eslint components/tabelas lib/tabelas lib/tabelas-estrutura-actions.ts app/*/tabelas`
Expected: `tsc` limpo; todos os testes passam; lint sem erros nos arquivos novos.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/dev...HEAD`
Expected: só os arquivos desta fase — `supabase/migrations/050_...`, `supabase/tests/050_...`, `lib/tabelas/trocar-tipo.ts`, `lib/tabelas-estrutura-actions.ts`, `components/tabelas/GerenciarEstrutura.tsx`, `components/tabelas/TabelaDetalhe.tsx`, `tests/tabelas-trocar-tipo.test.ts`, mais os specs/planos desta fase em `docs/`.

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo: resumo da Fase 2C; **migration `050` pendente de aplicação manual no dev** (`supabase/migrations/050_planilhas_estrutura.sql`) **e o teste de fumaça `supabase/tests/050_estrutura_smoke.sql` para rodar logo depois** (deve terminar com "050 OK"); avisar que este PR foi ramificado de `origin/dev` em paralelo com o PR da Fase 2B (busca/filtro/exportar, ainda não mergeado) — os dois tocam `TabelaDetalhe.tsx`, então o segundo a ser mergeado provavelmente vai ter conflito nesse arquivo (não é um bug, é esperado, avisar qual ordem de merge é mais simples: mergear primeiro o que estiver pronto, resolver o conflito no outro). Roteiro de teste manual: abrir "Gerenciar colunas" (só aparece pra quem configura o setor); renomear a tabela; renomear uma coluna e conferir que o dado da célula não mudou; mover uma coluna com as setas e ver a ordem mudar na grade; adicionar uma coluna nova de cada tipo (incluindo opções, digitando uma opção por linha); trocar o tipo de uma coluna com valores mistos (alguns convertem, outros não) e conferir a prévia antes de confirmar; excluir uma coluna e conferir a contagem de impacto antes de confirmar; tentar excluir a tabela digitando o nome errado (deve bloquear) e depois certo (deve excluir e voltar pra lista); confirmar que quem só edita linha (sem acesso a configurações) não vê o botão "Gerenciar colunas".

- [ ] **Step 4: Avisar o usuário**

1) Aplicar `050_planilhas_estrutura.sql` no dev **e em seguida rodar** `supabase/tests/050_estrutura_smoke.sql` (deve mostrar "050 OK"; se falhar, mandar a mensagem do erro). 2) Testar conforme o roteiro. 3) Lembrar que a migration `050` (e a `049` da Fase 2B, se ainda não tiver ido) precisa ir a produção antes da próxima promoção dev → main.
