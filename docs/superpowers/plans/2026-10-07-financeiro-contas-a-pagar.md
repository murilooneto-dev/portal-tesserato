# Financeiro: Contas a Pagar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tipo de Saída ganha forma de pagamento (Avulso / Recorrente / Prazo determinado) que cria as contas sozinho; nova página Contas a Pagar com botão Pagar; Pagamentos vira histórico do que foi pago.

**Architecture:** Toda a geração, alteração e remoção de contas acontece em funções SQL (migration 065), numa transação; o código TypeScript só chama essas funções e desenha as telas. Conta criada pelo tipo é um `financeiro_movimentos` com `competencia` preenchida e `pago = false`. A migration é compatível com o código antigo (um trigger preenche `pago_em`), então pode entrar no banco de dev antes do merge.

**Tech Stack:** Next.js (versão com mudanças de API: ler `node_modules/next/dist/docs/` antes de usar API nova), Supabase/Postgres, testes com `node:test` (`npm test`), componentes de `components/ui/`.

**Spec:** `docs/superpowers/specs/2026-10-07-financeiro-contas-a-pagar-design.md` (aprovada pelo usuário em 2026-10-07, incluindo os quatro pontos [CONFIRMAR]).

## Global Constraints

- Worktree `D:\DEV\Site Tesserato + Fiscal\wt-financeiro-contas-a-pagar`, branch `feat/financeiro-contas-a-pagar`. Não trabalhar na pasta `portal-tesserato`.
- Banco: **só o de dev** (`DEV_DATABASE_URL`, projeto `fcpcorqquovvgtoukxry`). Nada em produção. Quem aplica no dev é o controlador, não o subagente.
- PR contra `dev`. Nunca fazer merge. Não testar no navegador (o usuário testa na PR).
- Conta paga nunca é alterada nem apagada por mudança no tipo.
- Datas em `YYYY-MM-DD`, calculadas em ano/mês/dia inteiros; "hoje" é sempre o fuso de São Paulo (`hojeISO()` no código, `(now() at time zone 'America/Sao_Paulo')::date` no banco).
- Textos da interface em português, sem travessão; seguir os componentes e o estilo das telas vizinhas (`MovimentoListClient.tsx`, `FinanceiroCatalogoTab.tsx`).
- Comentários no código no mesmo tom e densidade dos arquivos vizinhos (em português, explicando o porquê).
- Cada task termina com `npx tsc --noEmit` limpo, `npm test` verde e um commit.

## Review Focus

1. **Dia 29/30/31 e virada de ano**: dia 31 com início em janeiro gera 28/02 (ou 29), 30/04; prazo de 6 meses começando em outubro termina em março do ano seguinte. → smoke SQL, Task 1.
2. **Reduzir o prazo com conta paga no trecho cortado**: a paga fica, só as não pagas somem. → smoke SQL, Task 1.
3. **Renovação repetida e conta excluída**: rodar `financeiro_renovar_recorrentes()` duas vezes não duplica; conta que o usuário excluiu não volta, nem pela renovação nem ao mudar só o valor do tipo. → smoke SQL, Task 1.
4. **Código antigo contra o banco novo** (deploy de dev antes do merge): `insert` de pagamento ou recebimento sem `pago_em` continua funcionando. → smoke SQL, Task 1.
5. **Clique duplo em Pagar / pagar o que já está pago**: o segundo clique não troca a data e a hora do primeiro; desfazer em pagamento avulso é recusado. → teste de `definirPagamentoConfirmado`, Task 2.

---

### Task 1: Migration 065 (banco)

**Files:**
- Create: `supabase/migrations/065_financeiro_contas_a_pagar.sql`
- Create: `supabase/rollback/065_rollback.sql`
- Create: `supabase/tests/065_financeiro_contas_a_pagar_smoke.sql`

**Interfaces:**
- Produces (usado pelas Tasks 2 a 6):
  - `financeiro_tipos`: `forma_pagamento text`, `valor_padrao numeric`, `dia_vencimento smallint`, `mes_inicio date`, `qtd_meses smallint`, `gerado_ate date`
  - `financeiro_movimentos`: `competencia date`, `pago_em_hora timestamptz`; `pago_em` nunca nulo quando `pago = true`
  - `financeiro_definir_forma_pagamento(p_tipo_id uuid, p_forma text, p_valor numeric, p_dia int, p_mes_inicio date, p_qtd_meses int, p_simular boolean default false) returns jsonb` → `{"criadas": n, "alteradas": n, "apagadas": n, "primeira": "YYYY-MM-01"|null, "ultima": "YYYY-MM-01"|null}`
  - `financeiro_renovar_recorrentes() returns integer` (só `service_role`)

- [ ] **Step 1: Conferir o número.** `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -3` e `gh pr list --state open --json number,title,files`. Se já existir 065 em `origin/dev` ou em PR aberta, usar o próximo número livre e trocar nos três nomes de arquivo.

- [ ] **Step 2: Escrever a migration.**

```sql
-- supabase/migrations/065_financeiro_contas_a_pagar.sql
--
-- Contas a Pagar do Financeiro. O Tipo de Saída passa a dizer como a despesa
-- se repete e o banco cria as contas:
--   avulso     = nada é criado (todos os tipos de hoje)
--   recorrente = uma conta por mês, do mês de início até dezembro; a rotina
--                diária renova o ano seguinte em dezembro
--   prazo      = uma conta por mês, pela quantidade de meses informada
-- Conta criada pelo tipo = financeiro_movimentos com `competencia` preenchida
-- e pago = false. Ao pagar, pago_em guarda o dia e pago_em_hora a data e hora.
-- Compatível com o código anterior: nada do que ele grava passa a falhar.

-- ---------- financeiro_tipos ----------
alter table public.financeiro_tipos
  add column if not exists forma_pagamento text not null default 'avulso',
  add column if not exists valor_padrao numeric(12,2),
  add column if not exists dia_vencimento smallint,
  add column if not exists mes_inicio date,
  add column if not exists qtd_meses smallint,
  -- Último mês já gerado. Meses até aqui não são recriados: se faltam, é
  -- porque foram pagos, ou excluídos pelo usuário.
  add column if not exists gerado_ate date;

alter table public.financeiro_tipos drop constraint if exists financeiro_tipos_forma_pagamento_check;
alter table public.financeiro_tipos add constraint financeiro_tipos_forma_pagamento_check check (
  (forma_pagamento = 'avulso'
    and valor_padrao is null and dia_vencimento is null and mes_inicio is null
    and qtd_meses is null and gerado_ate is null)
  or
  (forma_pagamento in ('recorrente', 'prazo')
    and natureza = 'saida'
    and valor_padrao > 0
    and dia_vencimento between 1 and 31
    and mes_inicio is not null and extract(day from mes_inicio) = 1
    and gerado_ate is not null
    and ((forma_pagamento = 'recorrente' and qtd_meses is null)
      or (forma_pagamento = 'prazo' and qtd_meses between 1 and 120)))
);

-- ---------- financeiro_movimentos ----------
alter table public.financeiro_movimentos
  add column if not exists competencia date,
  add column if not exists pago_em_hora timestamptz;

-- O banco impede duas contas do mesmo tipo no mesmo mês.
create unique index if not exists idx_financeiro_movimentos_tipo_competencia
  on public.financeiro_movimentos (tipo_id, competencia)
  where competencia is not null;

-- Pagamentos e Relatórios passam a olhar o dia do pagamento (pago_em), não o
-- vencimento. Para isso todo movimento pago precisa ter pago_em:
--   lançamento comum (sem série e sem competência) = pago no próprio dia dele,
--     e acompanha a data quando ela é editada;
--   conta = o dia em que o pagamento foi confirmado.
-- Feito em trigger para valer também para o código anterior a esta migration.
create or replace function public.financeiro_movimentos_pago_em_padrao()
returns trigger
language plpgsql
as $$
begin
  if new.pago then
    if new.recorrencia_id is null and new.competencia is null then
      new.pago_em := new.data;
    elsif new.pago_em is null then
      new.pago_em := new.data;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists financeiro_movimentos_pago_em_padrao on public.financeiro_movimentos;
create trigger financeiro_movimentos_pago_em_padrao
  before insert or update on public.financeiro_movimentos
  for each row execute function public.financeiro_movimentos_pago_em_padrao();

-- Movimentos pagos antes desta migration: nenhum muda de mês com isso.
update public.financeiro_movimentos set pago_em = data where pago and pago_em is null;

alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_pago_em_check;
alter table public.financeiro_movimentos add constraint financeiro_movimentos_pago_em_check
  check (not pago or pago_em is not null);

create index if not exists idx_financeiro_movimentos_pago_em
  on public.financeiro_movimentos (natureza, pago_em)
  where pago;

-- ---------- geração das contas ----------

-- Vencimento de um mês: o dia pedido, ou o último dia quando ele não existe
-- (29, 30 e 31).
create or replace function public.financeiro_vencimento(p_competencia date, p_dia integer)
returns date
language sql
immutable
as $$
  select p_competencia
    + (least(p_dia, extract(day from (p_competencia + interval '1 month' - interval '1 day'))::integer) - 1)
$$;

-- Último mês que um Recorrente deve ter: dezembro do ano de início ou do ano
-- corrente (o que for maior); em dezembro, já o do ano seguinte.
create or replace function public.financeiro_fim_recorrente(p_mes_inicio date, p_hoje date)
returns date
language sql
immutable
as $$
  select make_date(
    greatest(
      extract(year from p_mes_inicio)::integer,
      extract(year from p_hoje)::integer + case when extract(month from p_hoje) = 12 then 1 else 0 end
    ), 12, 1)
$$;

-- Grava a forma de pagamento de um Tipo de Saída e acerta as contas dele.
-- Conta paga nunca é tocada. p_simular = true só devolve as contagens.
create or replace function public.financeiro_definir_forma_pagamento(
  p_tipo_id uuid,
  p_forma text,
  p_valor numeric,
  p_dia integer,
  p_mes_inicio date,
  p_qtd_meses integer,
  p_simular boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo financeiro_tipos%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_fim date;
  v_muda_valor_dia boolean;
  v_criar date[] := '{}';
  v_criadas integer := 0;
  v_alteradas integer := 0;
  v_apagadas integer := 0;
begin
  if not is_admin() then
    raise exception 'Acesso negado.';
  end if;

  select * into v_tipo from financeiro_tipos where id = p_tipo_id for update;
  if not found then
    raise exception 'Tipo não encontrado.';
  end if;
  if v_tipo.natureza <> 'saida' then
    raise exception 'Forma de pagamento só existe em Tipo de Saída.';
  end if;
  if p_forma not in ('avulso', 'recorrente', 'prazo') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_forma <> 'avulso' then
    if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
    if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'Informe um dia de vencimento de 1 a 31.'; end if;
    if p_mes_inicio is null then raise exception 'Informe o mês de início.'; end if;
    v_inicio := date_trunc('month', p_mes_inicio)::date;
    -- Só barra o passado quando o mês de início está sendo escolhido agora:
    -- editar o valor de um tipo que começou em meses anteriores continua valendo.
    if v_inicio is distinct from v_tipo.mes_inicio and v_inicio < date_trunc('month', v_hoje)::date then
      raise exception 'O mês de início não pode ser anterior ao mês atual.';
    end if;
    if p_forma = 'prazo' then
      if p_qtd_meses is null or p_qtd_meses < 1 or p_qtd_meses > 120 then
        raise exception 'Informe a quantidade de meses, de 1 a 120.';
      end if;
      v_fim := (v_inicio + make_interval(months => p_qtd_meses - 1))::date;
    else
      v_fim := financeiro_fim_recorrente(v_inicio, v_hoje);
    end if;
  end if;

  v_muda_valor_dia := p_forma <> 'avulso' and v_tipo.forma_pagamento <> 'avulso'
    and (p_valor is distinct from v_tipo.valor_padrao or p_dia is distinct from v_tipo.dia_vencimento);

  -- Meses a criar: os do novo período que ainda não foram gerados antes
  -- (fora de [mes_inicio antigo, gerado_ate antigo]) e que não têm conta.
  -- generate_series em timestamp sem fuso: o mês não escorrega com o fuso da sessão.
  if p_forma <> 'avulso' then
    select coalesce(array_agg(c::date order by c), '{}') into v_criar
    from generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 month') c
    where (v_tipo.forma_pagamento = 'avulso' or c::date < v_tipo.mes_inicio or c::date > v_tipo.gerado_ate)
      and not exists (
        select 1 from financeiro_movimentos m where m.tipo_id = p_tipo_id and m.competencia = c::date
      );
  end if;
  v_criadas := coalesce(array_length(v_criar, 1), 0);

  select count(*) into v_apagadas
  from financeiro_movimentos m
  where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
    and (p_forma = 'avulso' or m.competencia < v_inicio or m.competencia > v_fim);

  if v_muda_valor_dia then
    select count(*) into v_alteradas
    from financeiro_movimentos m
    where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
      and m.competencia between v_inicio and v_fim;
  end if;

  if not p_simular then
    delete from financeiro_movimentos m
    where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
      and (p_forma = 'avulso' or m.competencia < v_inicio or m.competencia > v_fim);

    if v_muda_valor_dia then
      update financeiro_movimentos m
      set valor = p_valor, data = financeiro_vencimento(m.competencia, p_dia)
      where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
        and m.competencia between v_inicio and v_fim;
    end if;

    insert into financeiro_movimentos (natureza, tipo_id, valor, data, competencia, pago, criado_por)
    select 'saida', p_tipo_id, p_valor, financeiro_vencimento(c, p_dia), c, false, auth.uid()
    from unnest(v_criar) as c;

    if p_forma = 'avulso' then
      update financeiro_tipos
      set forma_pagamento = 'avulso', valor_padrao = null, dia_vencimento = null,
          mes_inicio = null, qtd_meses = null, gerado_ate = null
      where id = p_tipo_id;
    else
      update financeiro_tipos
      set forma_pagamento = p_forma, valor_padrao = p_valor, dia_vencimento = p_dia,
          mes_inicio = v_inicio, qtd_meses = case when p_forma = 'prazo' then p_qtd_meses end,
          gerado_ate = v_fim
      where id = p_tipo_id;
    end if;
  end if;

  return jsonb_build_object(
    'criadas', v_criadas, 'alteradas', v_alteradas, 'apagadas', v_apagadas,
    'primeira', v_inicio, 'ultima', v_fim);
end $$;

-- Renovação do Recorrente, chamada pela rotina diária com a chave de serviço.
-- Cria os meses entre gerado_ate e o fim devido (em dezembro, o ano seguinte
-- inteiro). Rodar de novo não duplica, e conta excluída pelo usuário não volta,
-- porque gerado_ate avança junto.
create or replace function public.financeiro_renovar_recorrentes()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tipo record;
  v_fim date;
  v_total integer := 0;
  v_n integer;
begin
  for v_tipo in
    select id, valor_padrao, dia_vencimento, mes_inicio, gerado_ate
    from financeiro_tipos
    where forma_pagamento = 'recorrente' and ativo
    for update
  loop
    v_fim := financeiro_fim_recorrente(v_tipo.mes_inicio, v_hoje);
    if v_tipo.gerado_ate < v_fim then
      insert into financeiro_movimentos (natureza, tipo_id, valor, data, competencia, pago)
      select 'saida', v_tipo.id, v_tipo.valor_padrao,
             financeiro_vencimento(c::date, v_tipo.dia_vencimento), c::date, false
      from generate_series((v_tipo.gerado_ate + interval '1 month')::timestamp, v_fim::timestamp, interval '1 month') c
      on conflict (tipo_id, competencia) where competencia is not null do nothing;
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
      update financeiro_tipos set gerado_ate = v_fim where id = v_tipo.id;
    end if;
  end loop;
  return v_total;
end $$;

revoke all on function public.financeiro_renovar_recorrentes() from public, anon, authenticated;
grant execute on function public.financeiro_renovar_recorrentes() to service_role;

-- ---------- permissão da página nova ----------
-- Quem já acessa Pagamentos recebe Contas a Pagar.
update public.profiles
set paginas_acesso = array_append(paginas_acesso, 'financeiro:contas-a-pagar')
where 'financeiro:pagamentos' = any (paginas_acesso)
  and not ('financeiro:contas-a-pagar' = any (paginas_acesso));
```

- [ ] **Step 3: Escrever o rollback** (`supabase/rollback/065_rollback.sql`), em `begin; set local lock_timeout = '5s'; ... commit;`, nesta ordem: `drop function` das quatro funções de geração; `drop trigger` + `drop function financeiro_movimentos_pago_em_padrao`; `drop constraint financeiro_movimentos_pago_em_check`; `drop index` dos dois índices; `alter table financeiro_movimentos drop column competencia, drop column pago_em_hora`; `drop constraint financeiro_tipos_forma_pagamento_check`; `drop column` das seis colunas de `financeiro_tipos`; `update profiles set paginas_acesso = array_remove(paginas_acesso, 'financeiro:contas-a-pagar')`. Cabeçalho avisando: as contas já criadas continuam como movimentos não pagos, e o `pago_em` preenchido pelo backfill fica (não faz mal ao código antigo).

- [ ] **Step 4: Escrever o smoke test** (`supabase/tests/065_financeiro_contas_a_pagar_smoke.sql`), no modelo de `supabase/tests/057_rls_tarefas_performance_smoke.sql`: `begin; ... rollback;`, blocos `do $$ ... assert ... $$`, mensagem final `065 OK`. Para passar em `is_admin()`, no início: pegar o id de um admin (`select id from profiles where role = 'admin' limit 1`) e `perform set_config('request.jwt.claims', json_build_object('sub', <id>, 'role', 'authenticated')::text, true)`. Cria os próprios tipos de teste (nomes `__smoke_065_*`). Datas sempre relativas ao mês atual (`date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date`), chamado aqui de M. Casos, cada um com `assert`:
  1. Recorrente, dia 31, início M: cria uma conta por mês de M até dezembro (em dezembro, até dezembro do ano seguinte); nenhuma `data` cai fora do mês da `competencia`; em mês de 30 dias a `data` é dia 30; retorno `criadas` = quantidade de linhas.
  2. `financeiro_vencimento('2027-02-01', 31) = '2027-02-28'` e `financeiro_vencimento('2028-02-01', 30) = '2028-02-29'`.
  3. Prazo de 6 meses, início M: 6 contas, a última em M + 5 meses (atravessa o ano quando M ≥ agosto).
  4. `p_simular = true` devolve as mesmas contagens e não grava nada (contagem de linhas igual antes e depois, `forma_pagamento` do tipo inalterada).
  5. No prazo de 6: marcar a 5ª como paga (`update ... set pago = true, pago_em = current_date`), reduzir para 3 meses → `apagadas = 2` (4ª e 6ª), a 5ª continua lá e paga. Voltar para 6 → recria a 4ª e a 6ª, não duplica a 5ª.
  6. Mudar só o valor: `alteradas` = não pagas, todas com o valor novo; a paga mantém o valor antigo. Excluir uma não paga à mão e mudar o valor de novo → a excluída **não** volta.
  7. Voltar para Avulso: somem as não pagas, a paga fica, colunas do tipo nulas.
  8. Mês de início M − 1 em tipo novo → exceção "anterior ao mês atual".
  9. `financeiro_renovar_recorrentes()` (como `service_role`: `set local role service_role` ou limpar os claims) duas vezes seguidas: a segunda devolve 0. Forçar a renovação de um tipo com `update financeiro_tipos set gerado_ate = gerado_ate - interval '2 months'` depois de apagar à mão essas duas contas → recria só essas duas.
  10. Tipo de Entrada → exceção "só existe em Tipo de Saída".
  11. Compatibilidade: `insert into financeiro_movimentos (natureza, tipo_id, valor, data) values ('entrada', ...)` sem `pago_em` funciona e sai com `pago_em = data`; `update ... set data = data + 1` nesse lançamento leva o `pago_em` junto; nenhuma linha da tabela com `pago and pago_em is null`.

- [ ] **Step 5 (controlador): aplicar no dev e rodar o smoke.** `secrets_list`, depois `secrets_run` com `DEV_DATABASE_URL` e psql 17 por caminho absoluto (detalhes na memória `reference_dev_db_acesso_cofre`): aplicar a migration dentro de `begin; set local lock_timeout = '5s'; ... commit;` e rodar o smoke. Esperado: `065 OK`. Conferir também se algum trigger de `profiles` barra o `update` de `paginas_acesso` rodando como `postgres`; se barrar, ajustar a migration e repetir.

- [ ] **Step 6: Commit** — `feat(financeiro): migration 065, contas a pagar geradas pelo tipo de saída`.

---

### Task 2: Ações e funções puras

**Files:**
- Modify: `lib/types.ts` (interface `FinanceiroTipo`, linha ~238)
- Modify: `lib/financeiro-movimentos.ts`
- Modify: `lib/financeiro-actions.ts`
- Test: `tests/financeiro-contas-a-pagar.test.ts` (novo)

**Interfaces:**
- Consumes: funções e colunas da Task 1.
- Produces:
  - `lib/types.ts`: `export type FinanceiroFormaPagamento = 'avulso' | 'recorrente' | 'prazo'`; `FinanceiroTipo` ganha, opcionais: `forma_pagamento?: FinanceiroFormaPagamento`, `valor_padrao?: number | null`, `dia_vencimento?: number | null`, `mes_inicio?: string | null`, `qtd_meses?: number | null`.
  - `lib/financeiro-movimentos.ts`:
    - `ehConta(m: { recorrencia_id?: string | null; competencia?: string | null }): boolean` — verdadeiro quando qualquer um dos dois está preenchido.
    - `interface ResultadoFormaPagamento { criadas: number; alteradas: number; apagadas: number; primeira: string | null; ultima: string | null }`
    - `textoPreviaFormaPagamento(r: ResultadoFormaPagamento, forma: FinanceiroFormaPagamento, valor: number | null, dia: number | null): string` — frases em português, uma por efeito que não seja zero. Exemplos: "Serão criadas 12 contas de R$ 350,00, de janeiro a dezembro de 2027, com vencimento no dia 10." / "3 contas não pagas passam para R$ 400,00, com vencimento no dia 10." / "2 contas não pagas serão apagadas." / tudo zero: "Nenhuma conta muda." Singular quando for 1.
    - `formatarPagoEm(pagoEm: string | null, pagoEmHora: string | null): string` — com hora: `"07/10 às 14:32"` (fuso `America/Sao_Paulo`); sem hora: `"07/10"` via `formatarDdMm`; os dois nulos: `"—"`.
  - `lib/financeiro-actions.ts`:
    - `interface FormaPagamentoInput { tipoId: string; forma: FinanceiroFormaPagamento; valor: number | null; dia: number | null; mesInicio: string | null; qtdMeses: number | null }` (`mesInicio` como `YYYY-MM-01`)
    - `previaFormaPagamentoTipo(input: FormaPagamentoInput): Promise<{ data: ResultadoFormaPagamento | null; error: string | null }>`
    - `definirFormaPagamentoTipo(input: FormaPagamentoInput): Promise<{ data: ResultadoFormaPagamento | null; error: string | null }>`
    - `definirPagamentoConfirmado(id: string, pago: boolean)` — mesma assinatura, comportamento novo (abaixo).
    - `atualizarConta(input: { id: string; centroCustoId: string | null; valor: number; data: string; observacao: string | null }): Promise<{ error: string | null }>` — edita uma conta não paga sem mexer no tipo.

- [ ] **Step 1: Testes primeiro** em `tests/financeiro-contas-a-pagar.test.ts` (`node:test` + `node:assert/strict`, como `tests/fase6-financeiro.test.ts`):
  - `ehConta`: nada preenchido → false; só `recorrencia_id` → true; só `competencia` → true.
  - `textoPreviaFormaPagamento`: os quatro exemplos acima, mais o singular ("Será criada 1 conta…").
  - `formatarPagoEm`: `('2026-10-07', '2026-10-07T17:32:00Z')` → `'07/10 às 14:32'`; `('2026-10-07', null)` → `'07/10'`; `(null, null)` → `'—'`.
  - Leitura do fonte de `lib/financeiro-actions.ts` (padrão já usado na suíte): `definirPagamentoConfirmado` contém `.eq('pago', !pago)` e grava `pago_em_hora`; as duas ações de forma de pagamento chamam `exigirAdmin` e `rpc('financeiro_definir_forma_pagamento'`.
- [ ] **Step 2: Rodar** `npm test` e ver os novos falharem.
- [ ] **Step 3: Implementar.**
  - `listarFinanceiroTipos` passa a selecionar também as cinco colunas novas.
  - `previaFormaPagamentoTipo` / `definirFormaPagamentoTipo`: `exigirAdmin()`, depois `supabase.rpc('financeiro_definir_forma_pagamento', { p_tipo_id, p_forma, p_valor, p_dia, p_mes_inicio, p_qtd_meses, p_simular })`. Erro do banco vai para `error` com a mensagem do `raise exception` (já em português). A que grava revalida `/admin/configuracoes/financeiro`, `/financeiro/contas-a-pagar`, `/financeiro/pagamentos`.
  - `definirPagamentoConfirmado`: ao pagar, `update({ pago: true, pago_em: hojeISO(), pago_em_hora: new Date().toISOString() })`; ao desfazer, `update({ pago: false, pago_em: null, pago_em_hora: null })`. Sempre com `.eq('natureza', 'saida').eq('pago', !pago)`: o segundo clique não acha linha e não troca a hora do primeiro. Ao desfazer, exigir também que seja conta: `.or('recorrencia_id.not.is.null,competencia.not.is.null')`. Sem linha alterada: ao pagar, "Esta conta já foi paga ou não existe mais."; ao desfazer, "Só dá para desfazer o pagamento de uma conta a pagar." Revalidar também `/financeiro/contas-a-pagar`.
  - `atualizarConta`: valida valor > 0 e data; `update({ centro_custo_id, valor, data, observacao }).eq('id', id).eq('natureza', 'saida').eq('pago', false)`; sem linha → "Conta não encontrada ou já paga." Revalida `/financeiro/contas-a-pagar`.
  - `excluirMovimento`: acrescentar `revalidatePath('/financeiro/contas-a-pagar')` quando a natureza for saída.
  - **Não** remover ainda `recorrente` / `tornarRecorrente` (sai na Task 5, junto com o modal).
- [ ] **Step 4:** `npm test` verde, `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** — `feat(financeiro): ações de forma de pagamento e de pagar conta`.

---

### Task 3: Forma de pagamento em Configurações

**Files:**
- Create: `app/admin/configuracoes/financeiro/FormaPagamentoModal.tsx`
- Modify: `app/admin/configuracoes/financeiro/FinanceiroCatalogoTab.tsx`

**Interfaces:**
- Consumes: `previaFormaPagamentoTipo`, `definirFormaPagamentoTipo`, `FormaPagamentoInput`, `textoPreviaFormaPagamento`, `FinanceiroTipo` (Task 2).
- Produces: `FormaPagamentoModal({ tipo: FinanceiroTipo, onClose: () => void, onSalvo: () => void })`.

- [ ] **Step 1: `FinanceiroCatalogoTab.tsx`.** Só quando `tipo === 'tipos' && natureza === 'saida'` (as outras três abas que usam o componente não mudam em nada):
  - `Item` passa a carregar os campos novos de `FinanceiroTipo`;
  - coluna nova **Forma de pagamento**, entre o nome e a Situação: "Avulso" em texto discreto; `Recorrente · R$ 350,00 · dia 10`; `Prazo determinado · 24 meses · R$ 350,00 · dia 10` (usar `formatarValor`);
  - item novo no menu ⋯, primeiro da lista: **Forma de pagamento** (ícone `CalendarClock` do lucide), abre o modal; ajustar o `rotulo` do menu;
  - `min-w` da tabela sobe para caber a coluna; ao salvar, `recarregar()` e aviso "Forma de pagamento salva."
- [ ] **Step 2: `FormaPagamentoModal.tsx`.** Usar o mesmo componente de modal e os mesmos campos (`Field`, `Input`, `Select`, `Button`, `Aviso`) de `components/financeiro/NovoMovimentoModal.tsx`.
  - Título: `Forma de pagamento · {nome do tipo}`.
  - Escolha entre **Avulso**, **Recorrente**, **Prazo determinado**, com uma linha explicando cada uma ("Não cria contas." / "Cria uma conta por mês, até dezembro, e renova todo ano." / "Cria uma conta por mês, pela quantidade de meses informada.").
  - Recorrente e Prazo: **Valor** (mesmo campo de valor do `NovoMovimentoModal`), **Dia do vencimento** (1 a 31), **Mês de início** (`<input type="month">`, `min` = mês atual quando o tipo ainda não tem `mes_inicio`; enviar como `YYYY-MM-01`). Prazo: **Quantidade de meses** (1 a 120). Sob o dia, quando for 29, 30 ou 31: "Nos meses mais curtos, vence no último dia."
  - Valores iniciais vindos do tipo.
  - **Salvar em dois passos:** o primeiro clique chama `previaFormaPagamentoTipo` e mostra `textoPreviaFormaPagamento` num `Aviso` (tom de perigo quando `apagadas > 0`), com os botões "Voltar" e "Confirmar"; "Confirmar" chama `definirFormaPagamentoTipo`. Mexer em qualquer campo volta ao primeiro passo. Se a prévia vier toda zerada e a forma não mudou, salvar direto.
  - Erro das ações aparece no modal (`role="alert"`), sem fechar.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm test`, `npm run lint` nos dois arquivos.
- [ ] **Step 4: Commit** — `feat(financeiro): forma de pagamento no Tipo de Saída`.

---

### Task 4: Página Contas a Pagar

**Files:**
- Create: `app/financeiro/contas-a-pagar/page.tsx`
- Create: `components/financeiro/ContasAPagarClient.tsx`
- Modify: `components/financeiro/NovoMovimentoModal.tsx` (modo "editar conta")
- Modify: `lib/paginas-setor.ts` (lista `financeiro`), `lib/navegacao.ts` (linha ~96 e `ICONE_PAGINA`; se o tipo `IconeMenu` exigir, registrar o ícone novo onde os outros são registrados)
- Test: `tests/financeiro-contas-a-pagar.test.ts`

**Interfaces:**
- Consumes: `definirPagamentoConfirmado`, `atualizarConta`, `excluirMovimento`, `situacaoPagamento`, `buscarEmBlocos`, `intervaloDoMes`.
- Produces: `ContasAPagarClient({ contas: ContaLinha[], mes, ano, hoje })`, com `ContaLinha = MovimentoLinha & { competencia: string | null }`; prop nova `conta?: boolean` em `MovimentoParaEditar`.

- [ ] **Step 1: Testes** (leitura de fonte, como o resto da suíte): `PAGINAS_POR_SETOR.financeiro` tem `contas-a-pagar` logo antes de `pagamentos`; `app/financeiro/contas-a-pagar/page.tsx` filtra `.eq('pago', false)`, usa `buscarEmBlocos` e não usa `.limit(`.
- [ ] **Step 2: `page.tsx`**, no modelo de `app/financeiro/pagamentos/page.tsx`: saídas com `pago = false` e `data <= último dia do mês do seletor` (pega o mês e as vencidas de antes), ordenadas por `data` crescente e `id`; `select` inclui `competencia`; `metadata.title = 'Contas a pagar — Tesserato Financeiro'`.
- [ ] **Step 3: `ContasAPagarClient.tsx`**, espelhando a estrutura de `MovimentoListClient.tsx` (cabeçalho, busca, ordenação, cartões no celular, tabela na tela larga, paginação de 50):
  - título "Contas a pagar"; subtítulo `{mês} de {ano} · N contas · total R$ X` e, havendo vencidas, `· vencido R$ Y`;
  - ordenações: Vencimento (mais antigo), Vencimento (mais recente), Maior valor, Menor valor; padrão a primeira;
  - colunas: Vencimento, Tipo, Centro de custo, Observação, Valor, Situação (`Badge` "A pagar" `warn` / "Vencido" `dng`), ações;
  - botão **Pagar** (`Button` pequeno, primário) em cada linha e cada cartão; desabilitado enquanto a ação roda; ao concluir, `useToast` com "Pago. Foi para Pagamentos." e ação **Desfazer** (`definirPagamentoConfirmado(id, false)`). Se o `Toast` do projeto não aceitar ação, mostrar um `Aviso` no topo da lista com o botão Desfazer, que some no próximo pagamento;
  - menu ⋯: **Editar** e **Excluir**. A confirmação de exclusão é a mesma de `MovimentoListClient` (linha vira faixa vermelha). "Este e os próximos" só aparece quando a conta tem `recorrencia_id`; conta com `competencia` mostra só "Excluir conta" e a frase "Para parar de criar esta conta, mude a forma de pagamento do tipo em Configurações.";
  - sem botão de criar. Vazio: "Nenhuma conta a pagar" / "Nada vence em {mês} e não há contas vencidas. As contas nascem da forma de pagamento do Tipo de Saída, em Configurações > Financeiro."
- [ ] **Step 4: `NovoMovimentoModal.tsx`**: com `movimento.conta === true`, título "Editar conta", seletor de tipo travado (mostra o nome, sem "Novo tipo"), rótulo da data "Vencimento", sem a caixa de recorrência, e o salvar chama `atualizarConta`.
- [ ] **Step 5: Menu e permissão.** `lib/paginas-setor.ts`: `{ slug: 'contas-a-pagar', label: 'Contas a pagar' }` antes de `pagamentos`. `lib/navegacao.ts`: incluir o slug na lista do Financeiro e um ícone próprio (lucide `CalendarClock` ou o que estiver livre no mapa de ícones). A tela de permissões por usuário já lê `PAGINAS_POR_SETOR`; conferir com `grep -rn "PAGINAS_POR_SETOR" app lib` que não há lista paralela a atualizar.
- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`, lint.
- [ ] **Step 7: Commit** — `feat(financeiro): página Contas a Pagar`.

---

### Task 5: Pagamentos vira histórico; Relatórios pelo dia do pagamento

**Files:**
- Modify: `app/financeiro/pagamentos/page.tsx`
- Modify: `components/financeiro/MovimentoListClient.tsx`
- Modify: `components/financeiro/NovoMovimentoModal.tsx`
- Modify: `lib/financeiro-actions.ts` (`criarMovimento`, `atualizarMovimento`)
- Modify: `lib/financeiro-movimentos.ts` (remover `datasSeguintesDaSerie`; `datasRecorrentes` só fica se ainda tiver uso)
- Modify: `app/financeiro/relatorios/page.tsx`, `app/financeiro/relatorios/RelatoriosFinanceiroClient.tsx`
- Modify: `tests/fase6-financeiro.test.ts`

**Interfaces:**
- Consumes: `ehConta`, `formatarPagoEm` (Task 2).
- Produces: `MovimentoLinha` ganha `pago_em?: string | null`, `pago_em_hora?: string | null`, `competencia?: string | null`.

- [ ] **Step 1: Testes.** Em `tests/fase6-financeiro.test.ts`: tirar os testes de `datasSeguintesDaSerie` e os que afirmam a caixa "Pagamento recorrente"; acrescentar leitura de fonte: Pagamentos filtra `.eq('pago', true)` e usa `pago_em` no intervalo; `criarMovimento` não tem mais `recorrente`; `atualizarMovimento` não tem mais `tornarRecorrente`; Relatórios usa `pago_em` nos filtros `de`/`ate`.
- [ ] **Step 2: `pagamentos/page.tsx`**: `.eq('pago', true).gte('pago_em', primeiroDia).lte('pago_em', ultimoDia)`; `select` com `pago_em, pago_em_hora, competencia`. Atualizar o comentário: a lista é do que foi **pago** no mês.
- [ ] **Step 3: `MovimentoListClient.tsx`** (só para `natureza === 'saida'`; Recebimentos fica idêntico):
  - coluna **Pago em** com `formatarPagoEm`; a coluna **Data** vira **Vencimento** e, em lançamento avulso, mostra "—" (pago em e data são o mesmo dia);
  - saem `seloSituacao`, o total "a pagar" do subtítulo e o item "Confirmar pagamento";
  - "Desfazer confirmação" vira **Desfazer pagamento** e aparece quando `ehConta(m)`; depois dele, aviso "Voltou para Contas a pagar.";
  - ordenações por data passam a usar `pago_em`; texto do vazio: "Nenhum pagamento em {mês}. As contas ainda não pagas ficam em Contas a pagar.";
  - o selo "Recorrente" continua nas contas (`ehConta`).
- [ ] **Step 4: `NovoMovimentoModal.tsx` e ações**: remover a caixa "Pagamento recorrente", os textos e estados ligados a ela e o campo `recorrente` de `MovimentoParaEditar` (o modo `conta` da Task 4 fica); remover `recorrente` de `criarMovimento` e `tornarRecorrente` de `atualizarMovimento`, com os ramos de série. `criarMovimento` sempre grava um lançamento pago (o trigger preenche `pago_em`). `excluirMovimento` não muda.
- [ ] **Step 5: Relatórios**: `page.tsx` troca `data` por `pago_em` em `gte`/`lte`/`order` e seleciona `pago_em`; a data mostrada na tela e no que ela exporta passa a ser `pago_em`. Atualizar o comentário do filtro `pago = true`.
- [ ] **Step 6:** `grep -rn "datasSeguintesDaSerie\|tornarRecorrente\|recorrente:" app lib components tests` sem sobras; `npm test`, `npx tsc --noEmit`, lint.
- [ ] **Step 7: Commit** — `feat(financeiro): Pagamentos vira histórico do que foi pago`.

---

### Task 6: Aviso por e-mail e renovação diária

**Files:**
- Modify: `lib/financeiro-aviso-vencimento-envio.ts`
- Modify: `lib/financeiro-aviso-vencimento.ts` (textos, linhas ~73 a 79)
- Modify: `app/api/cron/financeiro-aviso-vencimento/route.ts`
- Modify: `app/admin/configuracoes/financeiro/AvisoVencimentoTab.tsx` (só textos que dizem "recorrente")
- Modify: `tests/financeiro-aviso-vencimento.test.ts`

**Interfaces:**
- Consumes: `financeiro_renovar_recorrentes()` (Task 1).

- [ ] **Step 1: Testes.** Ajustar as frases esperadas de `montarEmailAviso`: "Nenhuma conta a pagar vence em {dia}." / "1 conta a pagar vence amanhã, {dia}, e ainda não foi paga:" / "{n} contas a pagar vencem amanhã, {dia}, e ainda não foram pagas:". Leitura de fonte: `buscarPagamentosQueVencem` não filtra mais `recorrencia_id`; a rota chama `rpc('financeiro_renovar_recorrentes')`.
- [ ] **Step 2: Envio.** Tirar `.not('recorrencia_id', 'is', null)`; atualizar os comentários de cabeçalho que dizem "pagamentos recorrentes". Assunto e corpo do e-mail conforme o Step 1.
- [ ] **Step 3: Rota.** Antes do e-mail, `createAdminClient().rpc('financeiro_renovar_recorrentes')` em `try/catch` próprio: falha registra `console.error('Renovação das contas recorrentes falhou:', e)` e segue para o e-mail; falha no e-mail não desfaz a renovação. A resposta JSON ganha `renovadas: number | null`. Comentário do cabeçalho passa a citar as duas funções da rota.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, lint.
- [ ] **Step 5: Commit** — `feat(financeiro): renovação diária do recorrente e aviso para toda conta a pagar`.

---

### Task 7: Fechamento

- [ ] **Step 1:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. Tudo limpo.
- [ ] **Step 2 (controlador):** rodar de novo o smoke 065 no dev (`065 OK`).
- [ ] **Step 3:** revisão final do branch inteiro contra a spec (um revisor, modelo mais capaz), com atenção ao Review Focus e a: Recebimentos idêntico ao de antes; as três outras abas de `FinanceiroCatalogoTab` sem mudança; nenhuma sobra de "recorrente" nas telas. Corrigir o que aparecer, inclusive os menores.
- [ ] **Step 4:** atualizar o cabeçalho da spec para "Aprovado pelo usuário em 2026-10-07" e tirar as marcas [CONFIRMAR]; `blueprint_update` no nó do Financeiro, se o mapa existir.
- [ ] **Step 5:** `git push -u origin feat/financeiro-contas-a-pagar` e PR contra `dev` com: o que muda para o usuário, migration 065 (aplicada só no dev, com rollback e smoke), roteiro de teste no navegador (criar um Recorrente e um Prazo, pagar, desfazer, reduzir prazo, voltar para Avulso, conferir Pagamentos e Relatórios) e a nota de que produção depende de OK e backup. Sem merge.
- [ ] **Step 6:** atualizar a memória do projeto (`project_financeiro_contas_a_pagar.md` e o índice).
