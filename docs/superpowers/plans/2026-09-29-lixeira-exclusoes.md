# Lixeira de exclusões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar por 60 dias toda linha apagada das 18 tabelas protegidas (por qualquer caminho, inclusive cascata) e permitir que um admin restaure uma exclusão inteira por uma tela "Lixeira".

**Architecture:** Um trigger genérico `BEFORE DELETE` copia a linha (`to_jsonb(OLD)`) para `public.lixeira`, agrupando por transação (`txid_current()`). A autoria vem de `auth.uid()` (sessão) ou do header `x-app-usuario` enviado pelo client de serviço. Funções SQL `SECURITY DEFINER` restauram (tudo ou nada, em ordem de dependência), listam (sem o conteúdo dos anexos) e limpam. Uma página de admin usa Server Actions para listar e restaurar.

**Tech Stack:** PostgreSQL/Supabase (RLS, plpgsql, PostgREST), Next.js 16 (App Router, Server Actions), TypeScript, `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-29-lixeira-exclusoes-design.md` (aprovada pelo usuário em 2026-09-29). Ler antes de começar.

## Global Constraints

- **Retenção: 60 dias** (`expira_em default now() + interval '60 days'`).
- **Somente o banco de DEV** (`fcpcorqquovvgtoukxry`). Nada em produção; migration **055** não é aplicada em produção neste trabalho.
- Mesma branch e mesma PR da confirmação de exclusão: branch `feat/exclusao-cliente-confirmacao` (PR #184), worktree `D:\DEV\Site Tesserato + Fiscal\wt-exclusao-cliente`. **Nunca fazer merge**, nunca push force.
- Toda função `SECURITY DEFINER` usa `set search_path = public, pg_temp`. `EXECUTE` das funções `lixeira_restaurar`, `lixeira_listar`, `lixeira_limpar` e `lixeira_capturar` **revogado** de `public`, `anon`, `authenticated`; as três primeiras concedidas só a `service_role`.
- `lixeira` com RLS ligada e **uma única policy**: `for all using (is_admin()) with check (is_admin())`.
- Cópia para a lixeira **falha fechada** (erro no `INSERT` cancela a exclusão); interpretação de autoria **falha aberta** (erro vira autor nulo).
- As 18 tabelas protegidas (nomes exatos): `clientes`, `clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`, `cliente_responsavel_historico`, `tarefas`, `tarefa_etapas`, `tarefa_arquivos`, `tarefas_avulsas`, `evento_arquivos`, `client_files`, `cliente_notas`, `observacoes_clientes`, `tarefa_grupos`, `parcelamentos`, `financeiro_movimentos`, `procedimentos_societario`, `procedimento_arquivos`.
- Ordem de restauração (pais antes de filhos, derivada das FKs reais): `clientes`, `parcelamentos`, `clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`, `cliente_responsavel_historico`, `cliente_notas`, `observacoes_clientes`, `tarefa_grupos`, `client_files`, `procedimentos_societario`, `tarefas`, `tarefas_avulsas`, `tarefa_etapas`, `tarefa_arquivos`, `evento_arquivos`, `procedimento_arquivos`, `financeiro_movimentos`.
- Mensagens ao usuário em **português**. Erros esperados voltam como `{ error }` (Server Actions), nunca `throw` (doc do Next desta versão).
- **TDD**: teste primeiro, vê-lo falhar, código mínimo, vê-lo passar. Rodar a suíte inteira (`npm test`) antes de dar uma tarefa por concluída.
- **Edição de arquivos:** usar a ferramenta Edit/Write, **não** `node -e '...'` com regex (a barra invertida se perde no escape do shell). Arquivos do repo usam LF no worktree; avisos "LF will be replaced by CRLF" são normais.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

### Ambiente: rodar SQL no dev ("Helper SQL")

Todo passo que roda SQL usa a ferramenta MCP `secrets_run` com `secrets: ["DEV_DATABASE_URL"]` (PowerShell). A senha do banco contém um `@`, então a URL é separada no **último** `@`. Bloco-padrão (colar no início do comando; `F` roda um arquivo, `Q` roda uma consulta):

```powershell
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$u = $env:DEV_DATABASE_URL
if ($u -notmatch 'fcpcorqquovvgtoukxry') { Write-Output 'PARANDO: nao e o dev'; exit 1 }
$m = [regex]::Match($u, '^postgres(?:ql)?://([^:]+):(.*)@([^@/]+)/([^?]*)')
$pass = $m.Groups[2].Value; if ($pass -match '%[0-9A-Fa-f]{2}') { $pass = [uri]::UnescapeDataString($pass) }
$h, $p = $m.Groups[3].Value.Split(':'); if (-not $p) { $p = '5432' }
$env:PGPASSWORD = $pass; $env:PGCLIENTENCODING = 'UTF8'
$a = @('-h', $h, '-p', $p, '-U', $m.Groups[1].Value, '-d', $m.Groups[4].Value, '-X', '-A', '-F', ' | ', '-v', 'ON_ERROR_STOP=1')
$w = 'D:\DEV\Site Tesserato + Fiscal\wt-exclusao-cliente'
function F($f) { $o = & $psql @a -f $f 2>&1; $c = $LASTEXITCODE; $o; "[exit=$c]" }
function Q($sql) { & $psql @a -c $sql 2>&1 }
```

Convenções de leitura: o PowerShell embrulha os `NOTICE` do psql como `NativeCommandError` (ruído); o que vale é o `[exit=N]` e as linhas `OK`/`FALHOU` dos testes. **Nunca imprimir a URL nem a senha.** Se o subagente não tiver acesso às ferramentas MCP, o controlador roda os passos de banco/navegador e devolve a saída.

### Ambiente: rodar o app local (tarefas com verificação em navegador)

Copiar o env do dev sem lê-lo: `cp "D:/DEV/Site Tesserato + Fiscal/portal-tesserato/.env.development.local" "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente/.env.development.local"`; subir com `runner_start({ command: 'npm run dev', cwd: 'wt-exclusao-cliente' })`; logar com `browser_login({ secret: 'ADMIN' })` (ou `FISCAL`, `CONTABIL`). No fim: `runner_stop`, e **apagar** o `.env.development.local` do worktree. O modo dev do Next demora >3 s para navegar após uma ação; esperar antes de concluir que não navegou. Usar `input` sem `[type=text]` como seletor.

## Review Focus

Modos de falha que a spec sugere e nenhuma tarefa "óbvia" cobriria; cada um tem teste na tarefa dona:

1. **Autoria forjada** (usuário com a chave pública envia `x-app-usuario` de outra pessoa): o header só vale com JWT `service_role`; com sessão vale `auth.uid()`; com claims `anon` ou sem claims o autor é nulo. → Task 1.
2. **Falha na cópia não pode deixar apagar sem backup:** com a lixeira rejeitando o `INSERT`, a exclusão falha e a linha continua existindo. → Task 1.
3. **Restaurar duas vezes, com conflito de id, com pai ausente ou por quem não é admin** deve recusar com mensagem em português, **sem restaurar parte**. → Task 2.
4. **Fichas por setor têm PK `cliente_id`** (sem coluna `id`) e "remover do setor" gera uma exclusão sem a linha de `clientes`: `registro_id` cai no fallback e a restauração reinclui o setor em `clientes.setores`. → Tasks 1 e 2.
5. **A listagem nunca pode trazer `content_base64`** (anexos de MBs) nem o `dados` inteiro. → Task 2 (`lixeira_listar`) e Task 5.
6. **Usuário comum e anônimo não enxergam nem chamam nada** da lixeira. → Tasks 1 e 2.
7. **Uma exclusão que mistura `parcelamentos` e `tarefas`** (FK `tarefas.parcelamento_id`) só restaura se `parcelamentos` entrar antes. → Task 2.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/055_lixeira.sql` (novo) | Tabela, RLS, função de captura, triggers, restauração, listagem, limpeza, agendamento opcional |
| `supabase/tests/055_lixeira_captura.sql` (novo) | Teste de comportamento da captura (transação desfeita) |
| `supabase/tests/055_lixeira_restauracao.sql` (novo) | Teste de comportamento de restauração/listagem/limpeza/permissões |
| `supabase/tests/055_lixeira_smoke.sql` (novo) | Smoke estrutural |
| `supabase/rollback/055_rollback.sql` (novo) | Desfaz a 055 |
| `lib/lixeira.ts` (novo) | Puro: header de autoria, rótulos, títulos, resumo, agrupamento, expiração |
| `tests/lixeira.test.ts` (novo) | Testes de `lib/lixeira.ts` |
| `lib/supabase/server.ts` (editar) | `createAdminClient(usuarioId?)` envia o header de autoria |
| `lib/lixeira-actions.ts` (novo) | Server Actions `listarExclusoes`, `restaurarExclusao` |
| `lib/rotas-admin.ts` (editar) + `tests/rotas-admin.test.ts` (novo) | `/admin/lixeira` exige admin no proxy |
| `app/admin/lixeira/page.tsx`, `app/admin/lixeira/LixeiraClient.tsx` (novos) | Tela |
| `components/fiscal/Sidebar.tsx` (editar) | Link "Lixeira" no bloco Admin |
| `lib/exclusao-cliente.ts`, `tests/exclusao-cliente.test.ts`, `components/geral/ConfirmarExclusaoClienteModal.tsx` (editar) | Aviso de restauração no modal da #184 |

---

### Task 1: Migration 055 (parte 1): tabela, RLS, captura, triggers

**Files:**
- Create: `supabase/migrations/055_lixeira.sql`
- Create: `supabase/tests/055_lixeira_captura.sql`

**Interfaces:**
- Produces (para as Tasks 2, 4, 5): tabela `public.lixeira(id, grupo, tabela, registro_id, dados, excluido_em, excluido_por, origem_autor, expira_em, restaurado_em, restaurado_por)`; função `public.lixeira_capturar()`; trigger `lixeira_capturar` em cada uma das 18 tabelas; o arquivo termina em `commit;` (a Task 2 insere a parte 2 **antes** dessa linha).

- [ ] **Step 1: Escrever o teste de captura (vai falhar: a tabela ainda não existe)**

Criar `supabase/tests/055_lixeira_captura.sql`:

```sql
-- supabase/tests/055_lixeira_captura.sql
-- Rodar com psql (-v ON_ERROR_STOP=1) SO NO DEV. Tudo dentro de UMA transacao desfeita.
-- Cada bloco imprime "OK ..." ou "FALHOU ..." (e provoca erro para o psql sair != 0).
begin;

select id as u_admin  from auth.users where email = 'admin.dev@tesserato.local' \gset
select id as u_fiscal from auth.users where email = 'fiscal@tesserato.local' \gset

-- massa: cliente so do Contabil com filhos em varios niveis
insert into public.clientes (nome, setores) values ('ZZLIX captura', '{contabil}') returning id \gset c_
insert into public.clientes_contabil (cliente_id) values (:'c_id');
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values
  (:'c_id', 'contabil', 'T1', 9, 2026), (:'c_id', 'contabil', 'T2', 9, 2026);
insert into public.tarefa_etapas (tarefa_id, nome)
  select id, 'etapa 1' from public.tarefas where cliente_id = :'c_id' order by tipo limit 1;

-- 1) exclusao pela SESSAO do admin: uma exclusao, 5 linhas, autor = admin, origem = sessao
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin'::text, 'role', 'authenticated')::text, true) as zz \gset
delete from public.clientes where id = :'c_id';
reset role;
select grupo as g1 from public.lixeira where tabela = 'clientes' and registro_id = :'c_id' \gset
select (count(*) = 5
        and count(distinct tabela) = 4
        and bool_and(excluido_por = :'u_admin'::uuid)
        and bool_and(origem_autor = 'sessao')) as ok
  from public.lixeira where grupo = :g1 \gset
\if :ok
\echo 'OK   1 exclusao pela sessao: cliente + ficha + 2 tarefas + 1 etapa em UM grupo, autor = admin, origem = sessao'
\else
\echo 'FALHOU 1 captura/cascata/autoria pela sessao'
select 1/0;
\endif

-- 2) ficha por setor tem PK cliente_id (sem coluna id): registro_id cai no fallback
select (registro_id = :'c_id') as ok from public.lixeira where grupo = :g1 and tabela = 'clientes_contabil' \gset
\if :ok
\echo 'OK   2 registro_id da ficha do setor usa cliente_id'
\else
\echo 'FALHOU 2 registro_id da ficha'
select 1/0;
\endif

-- 3) exclusao pela CHAVE DE SERVICO com header x-app-usuario: autor = o do header, origem = servico
insert into public.clientes (nome, setores) values ('ZZLIX servico', '{fiscal}') returning id \gset s_
select set_config('request.jwt.claims', '{"role":"service_role"}', true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'s_id';
select (excluido_por = :'u_admin'::uuid and origem_autor = 'servico') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'s_id' \gset
\if :ok
\echo 'OK   3 chave de servico + header: autor = usuario do header, origem = servico'
\else
\echo 'FALHOU 3 autoria pela chave de servico'
select 1/0;
\endif

-- 4) AUTORIA FORJADA: sessao de outro usuario mandando o header do admin => vale a sessao, nao o header
insert into public.clientes (nome, setores) values ('ZZLIX forja', '{fiscal}') returning id \gset f_
select set_config('request.jwt.claims', json_build_object('sub', :'u_fiscal'::text, 'role', 'authenticated')::text, true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'f_id';
select (excluido_por = :'u_fiscal'::uuid and origem_autor = 'sessao') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'f_id' \gset
\if :ok
\echo 'OK   4 header forjado ignorado quando ha sessao (vale auth.uid())'
\else
\echo 'FALHOU 4 header forjado foi honrado'
select 1/0;
\endif

-- 5) claims ANON com header: o header NAO e honrado (so vale com service_role); sem claims idem
insert into public.clientes (nome, setores) values ('ZZLIX anon', '{fiscal}') returning id \gset a_
select set_config('request.jwt.claims', '{"role":"anon"}', true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'a_id';
select (excluido_por is null and origem_autor = 'desconhecido') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'a_id' \gset
\if :ok
\echo 'OK   5 claims anon + header: autor desconhecido (header nao honrado)'
\else
\echo 'FALHOU 5 header honrado sem service_role'
select 1/0;
\endif

insert into public.clientes (nome, setores) values ('ZZLIX semclaims', '{fiscal}') returning id \gset n_
select set_config('request.jwt.claims', '', true) as zz \gset
select set_config('request.headers', '', true) as zz \gset
delete from public.clientes where id = :'n_id';
select (excluido_por is null and origem_autor = 'desconhecido') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'n_id' \gset
\if :ok
\echo 'OK   5b sem claims: autor desconhecido'
\else
\echo 'FALHOU 5b sem claims'
select 1/0;
\endif

-- 6) FALHA FECHADA: se a lixeira rejeitar a copia, a exclusao falha e a linha continua existindo
insert into public.clientes (nome, setores) values ('ZZLIX falha', '{fiscal}') returning id \gset x_
alter table public.lixeira add constraint zz_falha check (false) not valid;
do $$
begin
  delete from public.clientes where nome = 'ZZLIX falha';
  raise exception 'DEVERIA TER FALHADO: excluiu sem guardar copia';
exception when check_violation then
  null;
end $$;
alter table public.lixeira drop constraint zz_falha;
select (count(*) = 1) as ok from public.clientes where id = :'x_id' \gset
\if :ok
\echo 'OK   6 falha fechada: copia rejeitada => exclusao cancelada, cliente intacto'
\else
\echo 'FALHOU 6 cliente foi apagado sem copia'
select 1/0;
\endif

-- 7) ACESSO: usuario comum e anonimo nao veem nada; admin ve
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u_fiscal'::text, 'role', 'authenticated')::text, true) as zz \gset
select count(*) as n_comum from public.lixeira \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin'::text, 'role', 'authenticated')::text, true) as zz \gset
select count(*) as n_admin from public.lixeira \gset
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) as zz \gset
select count(*) as n_anon from public.lixeira \gset
reset role;
select (:n_comum = 0 and :n_anon = 0 and :n_admin > 0) as ok \gset
\if :ok
\echo 'OK   7 RLS: usuario comum e anonimo veem 0 linhas; admin ve a lixeira'
\else
\echo 'FALHOU 7 RLS da lixeira'
select 1/0;
\endif

rollback;
\echo 'TUDO OK: 055 captura'
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Usar o Helper SQL e `F "$w\supabase\tests\055_lixeira_captura.sql"`.
Expected: `[exit=3]` com erro `relation "public.lixeira" does not exist`.

- [ ] **Step 3: Escrever a migration (parte 1)**

Criar `supabase/migrations/055_lixeira.sql`:

```sql
-- supabase/migrations/055_lixeira.sql
--
-- Lixeira de exclusoes (spec: docs/superpowers/specs/2026-09-29-lixeira-exclusoes-design.md).
-- Toda linha apagada de uma das 18 tabelas protegidas, por qualquer caminho
-- (tela, Server Action, API direta ou cascata), e copiada para public.lixeira
-- e fica 60 dias. Um admin restaura uma exclusao inteira (grupo = transacao).
--
-- Transacional (tudo ou nada) e com lock_timeout: se uma consulta longa
-- segurar uma tabela, falha limpo e pode ser repetida. Idempotente.
-- SO DEV por enquanto. Producao: decisao separada do responsavel.

begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '055 abortada: funcao is_admin() nao existe';
  end if;
end $$;

-- ===== Tabela =====
create table if not exists public.lixeira (
  id             bigint generated always as identity primary key,
  grupo          bigint      not null,
  tabela         text        not null,
  registro_id    text,
  dados          jsonb       not null,
  excluido_em    timestamptz not null default now(),
  excluido_por   uuid,
  origem_autor   text        not null check (origem_autor in ('sessao', 'servico', 'desconhecido')),
  expira_em      timestamptz not null default (now() + interval '60 days'),
  restaurado_em  timestamptz,
  restaurado_por uuid
);

create index if not exists lixeira_grupo_idx      on public.lixeira (grupo);
create index if not exists lixeira_excluido_em_idx on public.lixeira (excluido_em desc);
create index if not exists lixeira_expira_em_idx   on public.lixeira (expira_em);

alter table public.lixeira enable row level security;
drop policy if exists "Admin gerencia lixeira" on public.lixeira;
create policy "Admin gerencia lixeira" on public.lixeira
  for all using (is_admin()) with check (is_admin());

-- ===== Captura =====
-- SECURITY DEFINER porque quem apaga (um operador, por exemplo) nao tem
-- permissao de escrita em lixeira. Falha FECHADA para a copia (o INSERT
-- propaga o erro e a exclusao inteira e cancelada); falha ABERTA para a
-- autoria (erro ao interpretar claims/headers vira autor nulo).
create or replace function public.lixeira_capturar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dados   jsonb := to_jsonb(old);
  v_autor   uuid;
  v_origem  text := 'desconhecido';
  v_claims  jsonb;
  v_headers jsonb;
begin
  if auth.uid() is not null then
    v_autor  := auth.uid();
    v_origem := 'sessao';
  else
    begin
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
      if v_claims->>'role' = 'service_role' then
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
        v_autor   := nullif(v_headers->>'x-app-usuario', '')::uuid;
        if v_autor is not null then
          v_origem := 'servico';
        end if;
      end if;
    exception when others then
      v_autor  := null;
      v_origem := 'desconhecido';
    end;
  end if;

  insert into public.lixeira (grupo, tabela, registro_id, dados, excluido_por, origem_autor)
  values (txid_current(), tg_table_name, coalesce(v_dados->>'id', v_dados->>'cliente_id'), v_dados, v_autor, v_origem);

  return old;
end;
$$;

revoke all on function public.lixeira_capturar() from public, anon, authenticated;

-- ===== Triggers nas 18 tabelas protegidas =====
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'tarefas', 'tarefa_etapas', 'tarefa_arquivos',
    'tarefas_avulsas', 'evento_arquivos', 'client_files', 'cliente_notas',
    'observacoes_clientes', 'tarefa_grupos', 'parcelamentos', 'financeiro_movimentos',
    'procedimentos_societario', 'procedimento_arquivos'
  ] loop
    execute format('drop trigger if exists lixeira_capturar on public.%I', t);
    execute format(
      'create trigger lixeira_capturar before delete on public.%I for each row execute function public.lixeira_capturar()', t);
  end loop;
end $$;

commit;
```

- [ ] **Step 4: Aplicar a migration no dev e rodar o teste**

Helper SQL: `F "$w\supabase\migrations\055_lixeira.sql"` (esperado `[exit=0]`, termina em `COMMIT`), depois `F "$w\supabase\tests\055_lixeira_captura.sql"`.
Expected: `[exit=0]`, linhas `OK 1`, `OK 2`, `OK 3`, `OK 4`, `OK 5`, `OK 5b`, `OK 6`, `OK 7` e `TUDO OK: 055 captura`. Se algum `FALHOU`, corrigir a migration (não o teste, salvo erro de digitação) e reaplicar (é idempotente).

- [ ] **Step 5: Confirmar que o dev não ficou com resíduo e commitar**

`Q "select count(*) as lixeira_linhas from public.lixeira"` deve dar `0` (o teste foi desfeito). Depois:

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add supabase && git commit -m "feat(lixeira): migration 055 parte 1 (tabela, RLS, captura por trigger) e teste de captura

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 055 (parte 2): restauração, listagem, limpeza, smoke e rollback

**Files:**
- Modify: `supabase/migrations/055_lixeira.sql` (inserir a parte 2 antes do `commit;` final)
- Create: `supabase/tests/055_lixeira_restauracao.sql`
- Create: `supabase/tests/055_lixeira_smoke.sql`
- Create: `supabase/rollback/055_rollback.sql`

**Interfaces:**
- Consumes: tabela `public.lixeira` e triggers da Task 1.
- Produces (para a Task 5): `public.lixeira_restaurar(p_grupo bigint, p_usuario uuid) returns jsonb` (`{"restaurado": {"<tabela>": n, ...}}`; erros em português via `raise exception`); `public.lixeira_listar(p_limite integer default 2000)` retorna `(id bigint, grupo bigint, tabela text, registro_id text, campos jsonb, excluido_em timestamptz, excluido_por uuid, origem_autor text, expira_em timestamptz, restaurado_em timestamptz)`; `public.lixeira_limpar() returns integer`.

- [ ] **Step 1: Escrever o teste de restauração (vai falhar: as funções não existem)**

Criar `supabase/tests/055_lixeira_restauracao.sql`:

```sql
-- supabase/tests/055_lixeira_restauracao.sql
-- Rodar com psql (-v ON_ERROR_STOP=1) SO NO DEV, DEPOIS da 055 completa. Transacao desfeita.
-- ATENCAO: como tudo roda em UMA transacao, todas as exclusoes daqui teriam o MESMO
-- grupo (txid_current()). O bloco R1 usa o grupo real (prova o agrupamento por
-- transacao); os blocos R3-R6 ISOLAM seu cenario anotando o maior id da lixeira
-- antes (watermark) e renumerando o grupo das linhas novas para um valor proprio.
begin;

select id as u_admin  from auth.users where email = 'admin.dev@tesserato.local' \gset
select id as u_fiscal from auth.users where email = 'fiscal@tesserato.local' \gset

-- ---------- R1: ida e volta identica (cliente + ficha + tarefas + etapa) ----------
insert into public.clientes (nome, setores) values ('ZZLIX restaura', '{contabil}') returning id \gset c_
insert into public.clientes_contabil (cliente_id) values (:'c_id');
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values
  (:'c_id', 'contabil', 'T1', 9, 2026), (:'c_id', 'contabil', 'T2', 9, 2026);
insert into public.tarefa_etapas (tarefa_id, nome)
  select id, 'etapa 1' from public.tarefas where cliente_id = :'c_id' order by tipo limit 1;

create temp table _orig as
  select 'clientes'::text as tabela, to_jsonb(c) as j from public.clientes c where c.id = :'c_id'
  union all select 'clientes_contabil', to_jsonb(x) from public.clientes_contabil x where x.cliente_id = :'c_id'
  union all select 'tarefas', to_jsonb(t) from public.tarefas t where t.cliente_id = :'c_id'
  union all select 'tarefa_etapas', to_jsonb(e) from public.tarefa_etapas e
            where e.tarefa_id in (select id from public.tarefas where cliente_id = :'c_id');

delete from public.clientes where id = :'c_id';
select grupo as g1 from public.lixeira where tabela = 'clientes' and registro_id = :'c_id' \gset
select (count(*) = 0) as ok from public.clientes where id = :'c_id' \gset
\if :ok
\echo 'OK   R1a cliente sumiu de clientes apos a exclusao'
\else
\echo 'FALHOU R1a'
select 1/0;
\endif

select public.lixeira_restaurar(:g1, :'u_admin') as resultado \gset
create temp table _dep as
  select 'clientes'::text as tabela, to_jsonb(c) as j from public.clientes c where c.id = :'c_id'
  union all select 'clientes_contabil', to_jsonb(x) from public.clientes_contabil x where x.cliente_id = :'c_id'
  union all select 'tarefas', to_jsonb(t) from public.tarefas t where t.cliente_id = :'c_id'
  union all select 'tarefa_etapas', to_jsonb(e) from public.tarefa_etapas e
            where e.tarefa_id in (select id from public.tarefas where cliente_id = :'c_id');
select ((select count(*) from ((select * from _orig except select * from _dep)
                                union all (select * from _dep except select * from _orig)) d) = 0
        and (select count(*) from _dep) = 5) as ok \gset
\if :ok
\echo 'OK   R1b restauracao devolve as 5 linhas IDENTICAS ao original (jsonb igual, linha a linha)'
\else
\echo 'FALHOU R1b banco diferente do original apos restaurar'
select 1/0;
\endif

select (count(*) = 5 and bool_and(restaurado_em is not null) and bool_and(restaurado_por = :'u_admin'::uuid)) as ok
  from public.lixeira where grupo = :g1 \gset
\if :ok
\echo 'OK   R1c linhas da lixeira marcadas como restauradas por quem restaurou'
\else
\echo 'FALHOU R1c'
select 1/0;
\endif

-- ---------- R2: restaurar duas vezes e recusado ----------
do $$
declare g bigint := (select grupo from public.lixeira where tabela = 'clientes' and dados->>'nome' = 'ZZLIX restaura' limit 1);
        u uuid   := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(g, u);
  raise exception 'DEVERIA TER RECUSADO: ja restaurada';
exception when raise_exception then
  if sqlerrm not like '%já foi restaurada%' then raise; end if;
end $$;
\echo 'OK   R2 segunda restauracao recusada com mensagem em portugues'

-- ---------- R3: conflito de id => recusa e o registro existente fica intacto ----------
select coalesce(max(id), 0) as w3 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX conflito', '{fiscal}') returning id \gset k_
delete from public.clientes where id = :'k_id';
update public.lixeira set grupo = 900000003 where id > :w3;
insert into public.clientes (id, nome, setores) values (:'k_id', 'ocupou o id', '{}');
do $$
declare u uuid := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(900000003, u);
  raise exception 'DEVERIA TER RECUSADO: id ja existe';
exception when raise_exception then
  if sqlerrm not like '%já existe um registro igual%' then raise; end if;
end $$;
select (nome = 'ocupou o id') as ok from public.clientes where id = :'k_id' \gset
\if :ok
\echo 'OK   R3 conflito de id recusado e o registro existente ficou intacto'
\else
\echo 'FALHOU R3'
select 1/0;
\endif
delete from public.clientes where id = :'k_id';

-- ---------- R4: pai ausente => recusa (tarefas restauradas sem o cliente) ----------
select coalesce(max(id), 0) as w4 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX pai', '{contabil}') returning id \gset p_
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values (:'p_id', 'contabil', 'TP', 9, 2026);
delete from public.tarefas where cliente_id = :'p_id';
delete from public.clientes where id = :'p_id';
update public.lixeira set grupo = 900000004 where id > :w4 and tabela = 'tarefas';
update public.lixeira set grupo = 900000104 where id > :w4 and tabela = 'clientes';
do $$
declare u uuid := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(900000004, u);
  raise exception 'DEVERIA TER RECUSADO: cliente pai ausente';
exception when raise_exception then
  if sqlerrm not like '%falta um registro do qual%' then raise; end if;
end $$;
select (count(*) = 0) as ok from public.tarefas where tipo = 'TP' and cliente_id = :'p_id' \gset
\if :ok
\echo 'OK   R4 pai ausente recusado em portugues e NADA foi restaurado pela metade'
\else
\echo 'FALHOU R4 restaurou tarefas sem o cliente'
select 1/0;
\endif

-- ---------- R5: ficha de setor restaurada REINCLUI o setor em clientes.setores ----------
select coalesce(max(id), 0) as w5 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX setor', '{fiscal,contabil}') returning id \gset m_
insert into public.clientes_contabil (cliente_id) values (:'m_id');
delete from public.clientes_contabil where cliente_id = :'m_id';
update public.clientes set setores = '{fiscal}' where id = :'m_id';
update public.lixeira set grupo = 900000005 where id > :w5;
select public.lixeira_restaurar(900000005, :'u_admin') as resultado \gset
select (setores = '{fiscal,contabil}'::public.user_setor[]) as ok from public.clientes where id = :'m_id' \gset
\if :ok
\echo 'OK   R5 restaurar a ficha do Contabil reincluiu o setor em clientes.setores'
\else
\echo 'FALHOU R5 setor nao foi reincluido'
select 1/0;
\endif

-- ---------- R6: ordem de dependencia: parcelamentos ANTES de tarefas ----------
select coalesce(max(id), 0) as w6 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX parc', '{fiscal}') returning id \gset r_
insert into public.parcelamentos (empresa, secao) values ('ZZLIX parcelamento', 'ZZ') returning id \gset pp_
insert into public.tarefas (cliente_id, setor, tipo, mes, ano, parcelamento_id) values (:'r_id', 'fiscal', 'TPARC', 9, 2026, :'pp_id');
delete from public.clientes where id = :'r_id';
delete from public.parcelamentos where id = :'pp_id';
update public.lixeira set grupo = 900000006 where id > :w6;
select public.lixeira_restaurar(900000006, :'u_admin') as resultado \gset
select ((select count(*) from public.tarefas where cliente_id = :'r_id' and parcelamento_id = :'pp_id') = 1
        and (select count(*) from public.parcelamentos where id = :'pp_id') = 1) as ok \gset
\if :ok
\echo 'OK   R6 parcelamento voltou antes da tarefa que depende dele (FK respeitada)'
\else
\echo 'FALHOU R6 ordem de restauracao'
select 1/0;
\endif

-- ---------- R7: quem nao e admin nao restaura ----------
do $$
declare g bigint := (select grupo from public.lixeira order by id desc limit 1);
        u uuid   := (select id from auth.users where email = 'fiscal@tesserato.local');
begin
  perform public.lixeira_restaurar(g, u);
  raise exception 'DEVERIA TER RECUSADO: nao e admin';
exception when raise_exception then
  if sqlerrm not like '%Somente administradores%' then raise; end if;
end $$;
\echo 'OK   R7 usuario nao admin recusado'

-- ---------- R8: permissoes de EXECUTE ----------
select (not has_function_privilege('anon', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and not has_function_privilege('anon', 'public.lixeira_listar(integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_listar(integer)', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_listar(integer)', 'execute')
        and not has_function_privilege('anon', 'public.lixeira_limpar()', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_limpar()', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_limpar()', 'execute')) as ok \gset
\if :ok
\echo 'OK   R8 EXECUTE: anon/authenticated sem acesso; so service_role'
\else
\echo 'FALHOU R8 permissoes de execute'
select 1/0;
\endif

-- ---------- R9: listagem NAO expoe o conteudo (dados / content_base64) ----------
select (pg_get_function_result('public.lixeira_listar(integer)'::regprocedure) not like '%dados%'
        and pg_get_function_result('public.lixeira_listar(integer)'::regprocedure) like '%campos jsonb%') as ok \gset
\if :ok
\echo 'OK   R9 lixeira_listar devolve so "campos" (sem dados nem content_base64)'
\else
\echo 'FALHOU R9 listagem expoe conteudo'
select 1/0;
\endif
select (count(*) > 0
        and bool_and(campos::text not like '%content_base64%')
        and bool_or(campos ? 'nome')) as ok from public.lixeira_listar(500) \gset
\if :ok
\echo 'OK   R9b listagem devolve linhas com titulo (campos.nome) e sem conteudo'
\else
\echo 'FALHOU R9b'
select 1/0;
\endif

-- ---------- R10: limpeza remove so o que expirou ----------
insert into public.lixeira (grupo, tabela, registro_id, dados, origem_autor, expira_em)
  values (999000001, 'clientes', 'zz-velho', '{"nome":"velho"}', 'desconhecido', now() - interval '1 day'),
         (999000002, 'clientes', 'zz-novo',  '{"nome":"novo"}',  'desconhecido', now() + interval '10 days');
select public.lixeira_limpar() as apagadas \gset
select ((select count(*) from public.lixeira where registro_id = 'zz-velho') = 0
        and (select count(*) from public.lixeira where registro_id = 'zz-novo') = 1
        and :apagadas >= 1) as ok \gset
\if :ok
\echo 'OK   R10 limpeza apagou so a linha expirada'
\else
\echo 'FALHOU R10'
select 1/0;
\endif

rollback;
\echo 'TUDO OK: 055 restauracao'
```

- [ ] **Step 2: Rodar o teste e ver falhar**

`F "$w\supabase\tests\055_lixeira_restauracao.sql"` → esperado `[exit=3]` com `function public.lixeira_restaurar(bigint, uuid) does not exist`.

- [ ] **Step 3: Escrever a parte 2 da migration**

Em `supabase/migrations/055_lixeira.sql`, **inserir o bloco abaixo imediatamente antes da linha final `commit;`** (usar a ferramenta Edit com `old_string` = `commit;` do fim do arquivo; ela aparece uma única vez):

```sql
-- ===== Restauracao (tudo ou nada, pais antes de filhos) =====
create or replace function public.lixeira_restaurar(p_grupo bigint, p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordem  text[] := array[
    'clientes', 'parcelamentos', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'cliente_notas', 'observacoes_clientes', 'tarefa_grupos',
    'client_files', 'procedimentos_societario', 'tarefas', 'tarefas_avulsas', 'tarefa_etapas',
    'tarefa_arquivos', 'evento_arquivos', 'procedimento_arquivos', 'financeiro_movimentos'
  ];
  v_tab    text;
  v_reg    record;
  v_resumo jsonb := '{}'::jsonb;
  v_n      integer;
  v_setor  text;
begin
  if not exists (select 1 from public.profiles where id = p_usuario and role = 'admin') then
    raise exception 'Somente administradores podem restaurar exclusões.';
  end if;
  if not exists (select 1 from public.lixeira where grupo = p_grupo) then
    raise exception 'Exclusão não encontrada (talvez já tenha expirado).';
  end if;
  if exists (select 1 from public.lixeira where grupo = p_grupo and restaurado_em is not null) then
    raise exception 'Esta exclusão já foi restaurada.';
  end if;
  if exists (select 1 from public.lixeira where grupo = p_grupo and tabela <> all (v_ordem)) then
    raise exception 'Esta exclusão contém uma tabela sem regra de restauração.';
  end if;

  foreach v_tab in array v_ordem loop
    v_n := 0;
    for v_reg in
      select l.dados from public.lixeira l where l.grupo = p_grupo and l.tabela = v_tab order by l.id
    loop
      begin
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', v_tab, v_tab)
          using v_reg.dados;
      exception
        when unique_violation then
          raise exception 'Não foi possível restaurar: já existe um registro igual (%). Talvez esta exclusão já tenha sido desfeita por outro caminho.', v_tab;
        when foreign_key_violation then
          raise exception 'Não foi possível restaurar: falta um registro do qual "%" depende (por exemplo, o cliente ou o parcelamento também foi apagado). Restaure primeiro a exclusão dele.', v_tab;
      end;
      v_n := v_n + 1;
    end loop;
    if v_n > 0 then
      v_resumo := v_resumo || jsonb_build_object(v_tab, v_n);
    end if;
  end loop;

  -- "Remover do setor" apaga a ficha do setor e depois faz UPDATE em clientes.setores
  -- (o UPDATE nao passa pela lixeira): ao restaurar a ficha, reinclui o setor.
  for v_reg in
    select l.tabela, l.dados->>'cliente_id' as cliente_id
      from public.lixeira l
     where l.grupo = p_grupo and l.tabela in ('clientes_fiscal', 'clientes_contabil', 'clientes_pessoal')
  loop
    v_setor := case v_reg.tabela
                 when 'clientes_fiscal'   then 'fiscal'
                 when 'clientes_contabil' then 'contabil'
                 else 'pessoal'
               end;
    update public.clientes
       set setores = array_append(setores, v_setor::public.user_setor)
     where id = v_reg.cliente_id::uuid
       and not (v_setor::public.user_setor = any(setores));
  end loop;

  update public.lixeira
     set restaurado_em = now(), restaurado_por = p_usuario
   where grupo = p_grupo;

  return jsonb_build_object('restaurado', v_resumo);
end;
$$;

-- ===== Listagem: NUNCA devolve o conteudo (content_base64 pode ter MBs) =====
create or replace function public.lixeira_listar(p_limite integer default 2000)
returns table (
  id            bigint,
  grupo         bigint,
  tabela        text,
  registro_id   text,
  campos        jsonb,
  excluido_em   timestamptz,
  excluido_por  uuid,
  origem_autor  text,
  expira_em     timestamptz,
  restaurado_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, l.grupo, l.tabela, l.registro_id,
         jsonb_strip_nulls(jsonb_build_object(
           'nome',     l.dados->>'nome',     'name',     l.dados->>'name',
           'titulo',   l.dados->>'titulo',   'empresa',  l.dados->>'empresa',
           'secao',    l.dados->>'secao',    'tipo',     l.dados->>'tipo',
           'mes',      l.dados->>'mes',      'ano',      l.dados->>'ano',
           'natureza', l.dados->>'natureza', 'valor',    l.dados->>'valor',
           'setor',    l.dados->>'setor',    'responsavel', l.dados->>'responsavel'
         )) as campos,
         l.excluido_em, l.excluido_por, l.origem_autor, l.expira_em, l.restaurado_em
    from public.lixeira l
   order by l.excluido_em desc, l.id desc
   limit greatest(p_limite, 1)
$$;

-- ===== Limpeza (60 dias) =====
create or replace function public.lixeira_limpar()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  delete from public.lixeira where expira_em < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ===== Permissoes: so a chave de servico executa =====
revoke all on function public.lixeira_restaurar(bigint, uuid) from public, anon, authenticated;
revoke all on function public.lixeira_listar(integer)         from public, anon, authenticated;
revoke all on function public.lixeira_limpar()                from public, anon, authenticated;
grant execute on function public.lixeira_restaurar(bigint, uuid) to service_role;
grant execute on function public.lixeira_listar(integer)         to service_role;
grant execute on function public.lixeira_limpar()                to service_role;

-- ===== Limpeza diaria (OPCIONAL): se pg_cron nao puder ser habilitado, segue sem ele;
-- a limpeza tambem roda sempre que o admin abre a Lixeira. =====
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('lixeira-limpar', '17 3 * * *', 'select public.lixeira_limpar()');
exception when others then
  raise notice 'pg_cron indisponivel (%): a limpeza acontece ao abrir a Lixeira.', sqlerrm;
end $$;

```

- [ ] **Step 4: Escrever o smoke estrutural**

Criar `supabase/tests/055_lixeira_smoke.sql`:

```sql
-- supabase/tests/055_lixeira_smoke.sql
-- Smoke estrutural da 055 (dev e, no futuro, producao). Nao altera nada.
begin;

do $$
declare
  t text;
  v_faltando text := '';
begin
  assert to_regclass('public.lixeira') is not null, 'tabela lixeira nao existe';
  assert (select relrowsecurity from pg_class where oid = 'public.lixeira'::regclass), 'RLS desligada em lixeira';
  assert (select count(*) from pg_policies where tablename = 'lixeira') = 1, 'lixeira deve ter exatamente 1 policy';
  assert (select qual from pg_policies where tablename = 'lixeira') like '%is_admin%', 'a policy da lixeira nao e de admin';
  assert (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'lixeira' and column_name = 'expira_em') like '%60 days%',
         'retencao padrao nao e 60 dias';

  foreach t in array array[
    'clientes', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'tarefas', 'tarefa_etapas', 'tarefa_arquivos',
    'tarefas_avulsas', 'evento_arquivos', 'client_files', 'cliente_notas',
    'observacoes_clientes', 'tarefa_grupos', 'parcelamentos', 'financeiro_movimentos',
    'procedimentos_societario', 'procedimento_arquivos'
  ] loop
    if not exists (select 1 from pg_trigger tg
                    where tg.tgrelid = ('public.' || t)::regclass and tg.tgname = 'lixeira_capturar' and not tg.tgisinternal) then
      v_faltando := v_faltando || ' ' || t;
    end if;
  end loop;
  assert v_faltando = '', 'sem trigger de captura em:' || v_faltando;

  assert (select bool_and(p.prosecdef) from pg_proc p
           where p.proname in ('lixeira_capturar', 'lixeira_restaurar', 'lixeira_listar', 'lixeira_limpar')
             and p.pronamespace = 'public'::regnamespace) , 'funcao da lixeira nao e SECURITY DEFINER';
  assert (select count(*) from pg_proc p
           where p.proname in ('lixeira_capturar', 'lixeira_restaurar', 'lixeira_listar', 'lixeira_limpar')
             and p.pronamespace = 'public'::regnamespace
             and p.proconfig::text like '%search_path=public, pg_temp%') = 4, 'search_path nao fixado em todas as funcoes';

  assert not has_function_privilege('anon', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'anon executa restaurar';
  assert not has_function_privilege('authenticated', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'authenticated executa restaurar';
  assert has_function_privilege('service_role', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'service_role nao executa restaurar';

  raise notice '055 OK';
end $$;

rollback;
select '055 OK' as resultado;
```

- [ ] **Step 5: Escrever o rollback**

Criar `supabase/rollback/055_rollback.sql`:

```sql
-- supabase/rollback/055_rollback.sql
-- Desfaz a migration 055. ATENCAO: apaga a tabela lixeira e TUDO que estiver guardado nela.
begin;
set local lock_timeout = '5s';

do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'tarefas', 'tarefa_etapas', 'tarefa_arquivos',
    'tarefas_avulsas', 'evento_arquivos', 'client_files', 'cliente_notas',
    'observacoes_clientes', 'tarefa_grupos', 'parcelamentos', 'financeiro_movimentos',
    'procedimentos_societario', 'procedimento_arquivos'
  ] loop
    execute format('drop trigger if exists lixeira_capturar on public.%I', t);
  end loop;
end $$;

do $$
begin
  perform cron.unschedule('lixeira-limpar');
exception when others then
  null; -- pg_cron nao instalado ou job inexistente
end $$;

drop function if exists public.lixeira_restaurar(bigint, uuid);
drop function if exists public.lixeira_listar(integer);
drop function if exists public.lixeira_limpar();
drop function if exists public.lixeira_capturar();
drop table if exists public.lixeira;

commit;
```

- [ ] **Step 6: Aplicar a parte 2 e rodar todos os testes SQL**

Helper SQL, em sequência: `F "$w\supabase\migrations\055_lixeira.sql"` (esperado `[exit=0]`), `F "$w\supabase\tests\055_lixeira_captura.sql"` (`TUDO OK: 055 captura`), `F "$w\supabase\tests\055_lixeira_restauracao.sql"` (esperado `OK R1a` … `OK R10` e `TUDO OK: 055 restauracao`), `F "$w\supabase\tests\055_lixeira_smoke.sql"` (esperado `resultado | 055 OK`).
Expected: todos `[exit=0]`. Se `R2`/`R3`/`R4`/`R7` mostrarem erro diferente da mensagem esperada, ajustar o texto da função (a mensagem é contrato com o teste). Anotar se o `NOTICE` de `pg_cron` disse "indisponivel" (é aceitável).

- [ ] **Step 7: Testar o rollback e reaplicar**

`F "$w\supabase\rollback\055_rollback.sql"` (`[exit=0]`), depois `Q "select to_regclass('public.lixeira') as existe"` deve mostrar vazio; `F "$w\supabase\tests\055_lixeira_smoke.sql"` deve **falhar** (`[exit=3]`, "tabela lixeira nao existe"); reaplicar `F "$w\supabase\migrations\055_lixeira.sql"` e o smoke deve voltar a `055 OK`.

- [ ] **Step 8: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add supabase && git commit -m "feat(lixeira): migration 055 parte 2 (restauracao, listagem, limpeza), smoke, testes e rollback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/lixeira.ts` (regras puras) com TDD

**Files:**
- Create: `lib/lixeira.ts`
- Create: `tests/lixeira.test.ts`

**Interfaces:**
- Produces (Tasks 4, 5, 6): `HEADER_AUTORIA: 'x-app-usuario'`; `cabecalhosDeAutoria(usuarioId?: string | null): Record<string, string>`; tipos `OrigemAutor`, `LinhaLixeira`, `ExclusaoAgrupada`; `textoResumo(contagens: Record<string, number>): string`; `tituloDaLinha(tabela: string, campos: Record<string, string>): string`; `diasAteExpirar(expiraEm: string, agora: Date): number`; `agruparExclusoes(linhas: LinhaLixeira[], agora: Date, nomesPorId?: Record<string, string>): ExclusaoAgrupada[]`.

- [ ] **Step 1: Escrever os testes (vão falhar: o módulo não existe)**

Criar `tests/lixeira.test.ts`:

```ts
// tests/lixeira.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEADER_AUTORIA,
  cabecalhosDeAutoria,
  textoResumo,
  tituloDaLinha,
  diasAteExpirar,
  agruparExclusoes,
  type LinhaLixeira,
} from '../lib/lixeira'

const UUID = '3d64c7b8-bbee-445b-bb5e-ed97e50a8060'

// ---------- cabecalhosDeAutoria ----------

test('cabecalhosDeAutoria: usuário válido vira o header x-app-usuario', () => {
  assert.equal(HEADER_AUTORIA, 'x-app-usuario')
  assert.deepEqual(cabecalhosDeAutoria(UUID), { 'x-app-usuario': UUID })
})

test('cabecalhosDeAutoria: sem usuário não manda header nenhum', () => {
  assert.deepEqual(cabecalhosDeAutoria(undefined), {})
  assert.deepEqual(cabecalhosDeAutoria(null), {})
  assert.deepEqual(cabecalhosDeAutoria(''), {})
})

test('cabecalhosDeAutoria: valor que não é UUID (inclusive com quebra de linha) é descartado', () => {
  assert.deepEqual(cabecalhosDeAutoria('nao-e-uuid'), {})
  assert.deepEqual(cabecalhosDeAutoria(`${UUID}\r\nx-outro: 1`), {})
})

// ---------- textoResumo ----------

test('textoResumo: singular e plural, na ordem de prioridade das tabelas', () => {
  assert.equal(
    textoResumo({ tarefas: 19, clientes: 1, tarefa_arquivos: 3 }),
    '1 cliente, 19 tarefas, 3 anexos de tarefas',
  )
})

test('textoResumo: um item usa o singular', () => {
  assert.equal(textoResumo({ tarefas: 1 }), '1 tarefa')
})

test('textoResumo: tabela desconhecida aparece pelo nome, sem quebrar', () => {
  assert.equal(textoResumo({ clientes: 1, tabela_nova: 2 }), '1 cliente, 2 tabela_nova')
})

// ---------- tituloDaLinha ----------

test('tituloDaLinha: cliente usa o nome', () => {
  assert.equal(tituloDaLinha('clientes', { nome: 'ACME LTDA' }), 'ACME LTDA')
})

test('tituloDaLinha: parcelamento usa empresa e seção', () => {
  assert.equal(tituloDaLinha('parcelamentos', { empresa: 'ACME', secao: 'PGFN - ECAC' }), 'ACME — PGFN - ECAC')
})

test('tituloDaLinha: tarefa usa tipo e mês/ano', () => {
  assert.equal(tituloDaLinha('tarefas', { tipo: 'ENTRADA', mes: '9', ano: '2026' }), 'ENTRADA (9/2026)')
})

test('tituloDaLinha: anexo usa o nome do arquivo', () => {
  assert.equal(tituloDaLinha('client_files', { name: 'balanco.xlsx' }), 'balanco.xlsx')
})

test('tituloDaLinha: sem campos úteis cai no rótulo da tabela (com inicial maiúscula)', () => {
  assert.equal(tituloDaLinha('clientes_contabil', {}), 'Ficha do Contábil')
  assert.equal(tituloDaLinha('tabela_nova', {}), 'tabela_nova')
})

// ---------- diasAteExpirar ----------

test('diasAteExpirar: conta dias inteiros arredondando para cima', () => {
  const agora = new Date('2026-09-29T12:00:00Z')
  assert.equal(diasAteExpirar('2026-11-28T12:00:00Z', agora), 60)
  assert.equal(diasAteExpirar('2026-09-29T20:00:00Z', agora), 1)
})

test('diasAteExpirar: já expirado não fica negativo', () => {
  assert.equal(diasAteExpirar('2026-09-01T00:00:00Z', new Date('2026-09-29T12:00:00Z')), 0)
})

// ---------- agruparExclusoes ----------

function linha(p: Partial<LinhaLixeira> & Pick<LinhaLixeira, 'id' | 'grupo' | 'tabela'>): LinhaLixeira {
  return {
    registro_id: null, campos: {}, excluido_em: '2026-09-29T10:00:00Z', excluido_por: null,
    origem_autor: 'desconhecido', expira_em: '2026-11-28T10:00:00Z', restaurado_em: null, ...p,
  }
}

test('agruparExclusoes: junta as linhas do mesmo grupo e escolhe o cliente como raiz', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 10, tabela: 'tarefas', campos: { tipo: 'T1', mes: '9', ano: '2026' } }),
    linha({ id: 2, grupo: 10, tabela: 'clientes', campos: { nome: 'ACME' } }),
    linha({ id: 3, grupo: 10, tabela: 'tarefas', campos: { tipo: 'T2', mes: '9', ano: '2026' } }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r.length, 1)
  assert.equal(r[0].grupo, 10)
  assert.equal(r[0].titulo, 'ACME')
  assert.equal(r[0].tabelaRaiz, 'clientes')
  assert.equal(r[0].resumo, '1 cliente, 2 tarefas')
  assert.deepEqual(r[0].contagens, { clientes: 1, tarefas: 2 })
})

test('agruparExclusoes: mais recentes primeiro', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, excluido_em: '2026-09-01T10:00:00Z' }),
    linha({ id: 2, grupo: 2, tabela: 'clientes', campos: { nome: 'B' }, excluido_em: '2026-09-20T10:00:00Z' }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.deepEqual(r.map(x => x.titulo), ['B', 'A'])
})

test('agruparExclusoes: só é restaurada quando TODAS as linhas do grupo foram restauradas', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, restaurado_em: '2026-09-29T11:00:00Z' }),
    linha({ id: 2, grupo: 1, tabela: 'tarefas', campos: { tipo: 'T' } }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].restaurada, false)
})

test('agruparExclusoes: resolve o nome de quem apagou e mantém a origem da autoria', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, excluido_por: UUID, origem_autor: 'servico' }),
  ], new Date('2026-09-29T12:00:00Z'), { [UUID]: 'Admin Dev' })
  assert.equal(r[0].excluidoPorNome, 'Admin Dev')
  assert.equal(r[0].origemAutor, 'servico')
})

test('agruparExclusoes: autor desconhecido fica com nome nulo', () => {
  const r = agruparExclusoes([linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' } })], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].excluidoPorNome, null)
})

test('agruparExclusoes: calcula os dias restantes até expirar', () => {
  const r = agruparExclusoes([
    linha({ id: 1, grupo: 1, tabela: 'clientes', campos: { nome: 'A' }, expira_em: '2026-11-28T12:00:00Z' }),
  ], new Date('2026-09-29T12:00:00Z'))
  assert.equal(r[0].diasRestantes, 60)
})

test('agruparExclusoes: lista vazia dá lista vazia', () => {
  assert.deepEqual(agruparExclusoes([], new Date()), [])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && node --import tsx --test tests/lixeira.test.ts`
Expected: FAIL com `Cannot find module '../lib/lixeira'`.

- [ ] **Step 3: Implementar `lib/lixeira.ts`**

```ts
// lib/lixeira.ts
//
// Regras puras da Lixeira (sem React, sem Supabase): header de autoria, rótulos,
// título/resumo de cada exclusão e agrupamento das linhas guardadas pelo
// trigger (grupo = transação). Spec: docs/superpowers/specs/2026-09-29-lixeira-exclusoes-design.md

export const HEADER_AUTORIA = 'x-app-usuario'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Header que o client de serviço manda para o trigger saber quem apagou.
// Só aceita UUID válido (nada de quebra de linha ou texto livre em header).
export function cabecalhosDeAutoria(usuarioId?: string | null): Record<string, string> {
  return usuarioId && UUID_RE.test(usuarioId) ? { [HEADER_AUTORIA]: usuarioId } : {}
}

export type OrigemAutor = 'sessao' | 'servico' | 'desconhecido'

// Linha devolvida por public.lixeira_listar (sem o conteúdo da linha apagada).
export interface LinhaLixeira {
  id: number
  grupo: number
  tabela: string
  registro_id: string | null
  campos: Record<string, string>
  excluido_em: string
  excluido_por: string | null
  origem_autor: OrigemAutor
  expira_em: string
  restaurado_em: string | null
}

export interface ExclusaoAgrupada {
  grupo: number
  titulo: string
  resumo: string
  tabelaRaiz: string
  contagens: Record<string, number>
  excluidoEm: string
  excluidoPor: string | null
  excluidoPorNome: string | null
  origemAutor: OrigemAutor
  expiraEm: string
  diasRestantes: number
  restaurada: boolean
}

const ROTULOS: Record<string, [string, string]> = {
  clientes: ['cliente', 'clientes'],
  clientes_fiscal: ['ficha do Fiscal', 'fichas do Fiscal'],
  clientes_contabil: ['ficha do Contábil', 'fichas do Contábil'],
  clientes_pessoal: ['ficha do Pessoal', 'fichas do Pessoal'],
  cliente_responsavel_historico: ['registro de responsável', 'registros de responsável'],
  tarefas: ['tarefa', 'tarefas'],
  tarefa_etapas: ['etapa de tarefa', 'etapas de tarefas'],
  tarefa_arquivos: ['anexo de tarefa', 'anexos de tarefas'],
  tarefas_avulsas: ['evento avulso', 'eventos avulsos'],
  evento_arquivos: ['anexo de evento', 'anexos de eventos'],
  client_files: ['arquivo do cliente', 'arquivos do cliente'],
  cliente_notas: ['nota', 'notas'],
  observacoes_clientes: ['observação', 'observações'],
  tarefa_grupos: ['grupo de tarefas', 'grupos de tarefas'],
  parcelamentos: ['parcelamento', 'parcelamentos'],
  financeiro_movimentos: ['movimento financeiro', 'movimentos financeiros'],
  procedimentos_societario: ['procedimento do Societário', 'procedimentos do Societário'],
  procedimento_arquivos: ['anexo de procedimento', 'anexos de procedimentos'],
}

// Quem "representa" a exclusão na lista (a primeira tabela presente vence).
const PRIORIDADE_RAIZ = [
  'clientes', 'parcelamentos', 'procedimentos_societario', 'financeiro_movimentos', 'tarefas_avulsas',
  'tarefas', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal', 'cliente_notas',
  'observacoes_clientes', 'tarefa_grupos', 'client_files', 'cliente_responsavel_historico',
  'tarefa_etapas', 'tarefa_arquivos', 'evento_arquivos', 'procedimento_arquivos',
]

function rotulo(tabela: string, n: number): string {
  const r = ROTULOS[tabela]
  if (!r) return tabela
  return n === 1 ? r[0] : r[1]
}

function ordenarPorPrioridade(tabelas: string[]): string[] {
  const pos = (t: string) => {
    const i = PRIORIDADE_RAIZ.indexOf(t)
    return i === -1 ? PRIORIDADE_RAIZ.length : i
  }
  return [...tabelas].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
}

export function textoResumo(contagens: Record<string, number>): string {
  return ordenarPorPrioridade(Object.keys(contagens))
    .map(t => `${contagens[t]} ${rotulo(t, contagens[t])}`)
    .join(', ')
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function tituloDaLinha(tabela: string, campos: Record<string, string>): string {
  const c = campos
  const partes = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ')
  switch (tabela) {
    case 'clientes':
      if (c.nome) return c.nome
      break
    case 'parcelamentos':
      if (c.empresa) return c.secao ? `${c.empresa} — ${c.secao}` : c.empresa
      break
    case 'tarefas':
      if (c.tipo) return c.mes && c.ano ? `${c.tipo} (${c.mes}/${c.ano})` : c.tipo
      break
    case 'tarefas_avulsas':
      if (c.titulo) return c.titulo
      break
    case 'financeiro_movimentos':
      if (c.natureza) return partes(capitalizar(c.natureza), c.valor ? `· R$ ${c.valor}` : undefined)
      break
    case 'procedimentos_societario':
      if (c.empresa) return c.empresa
      break
    case 'client_files':
    case 'tarefa_arquivos':
    case 'evento_arquivos':
    case 'procedimento_arquivos':
      if (c.name) return c.name
      break
    case 'tarefa_grupos':
    case 'tarefa_etapas':
      if (c.nome) return c.nome
      break
    case 'cliente_responsavel_historico':
      if (c.responsavel) return c.responsavel
      break
    case 'observacoes_clientes':
      if (c.mes && c.ano) return `Observação ${c.mes}/${c.ano}`
      break
    default:
      break
  }
  return ROTULOS[tabela] ? capitalizar(ROTULOS[tabela][0]) : tabela
}

export function diasAteExpirar(expiraEm: string, agora: Date): number {
  const ms = new Date(expiraEm).getTime() - agora.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

export function agruparExclusoes(
  linhas: LinhaLixeira[],
  agora: Date,
  nomesPorId: Record<string, string> = {},
): ExclusaoAgrupada[] {
  const porGrupo = new Map<number, LinhaLixeira[]>()
  for (const l of linhas) {
    const lista = porGrupo.get(l.grupo)
    if (lista) lista.push(l)
    else porGrupo.set(l.grupo, [l])
  }

  const resultado: ExclusaoAgrupada[] = []
  for (const [grupo, grupoLinhas] of porGrupo) {
    const contagens: Record<string, number> = {}
    for (const l of grupoLinhas) contagens[l.tabela] = (contagens[l.tabela] ?? 0) + 1

    const tabelaRaiz = ordenarPorPrioridade(Object.keys(contagens))[0]
    const linhaRaiz = grupoLinhas.find(l => l.tabela === tabelaRaiz) ?? grupoLinhas[0]
    const primeira = grupoLinhas[0]

    resultado.push({
      grupo,
      titulo: tituloDaLinha(tabelaRaiz, linhaRaiz.campos),
      resumo: textoResumo(contagens),
      tabelaRaiz,
      contagens,
      excluidoEm: primeira.excluido_em,
      excluidoPor: primeira.excluido_por,
      excluidoPorNome: primeira.excluido_por ? (nomesPorId[primeira.excluido_por] ?? null) : null,
      origemAutor: primeira.origem_autor,
      expiraEm: primeira.expira_em,
      diasRestantes: diasAteExpirar(primeira.expira_em, agora),
      restaurada: grupoLinhas.every(l => l.restaurado_em !== null),
    })
  }

  return resultado.sort(
    (a, b) => new Date(b.excluidoEm).getTime() - new Date(a.excluidoEm).getTime() || b.grupo - a.grupo,
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/lixeira.test.ts`
Expected: todos os testes `✔`, `ℹ fail 0`. Depois `npm test` (suíte inteira) e `npx tsc --noEmit` limpos.

- [ ] **Step 5: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add lib/lixeira.ts tests/lixeira.test.ts && git commit -m "feat(lixeira): regras puras (autoria, titulo, resumo, agrupamento) com testes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Autoria no client de serviço

**Files:**
- Modify: `lib/supabase/server.ts` (`createAdminClient` e `getAuthenticatedAdmin`)

**Interfaces:**
- Consumes: `cabecalhosDeAutoria` (Task 3); trigger e tabela da Task 1 aplicados no dev.
- Produces: `createAdminClient(usuarioId?: string)` (retrocompatível: sem argumento continua igual); `getAuthenticatedAdmin()` passa a enviar o header com o `user.id` autenticado.

- [ ] **Step 1: Editar `createAdminClient` para aceitar o usuário (com a ferramenta Edit)**

Substituir, em `lib/supabase/server.ts`, o bloco:

```ts
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada. Adicione em: Vercel → Settings → Environment Variables')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

por:

```ts
// `usuarioId` (opcional) vai no header x-app-usuario: o trigger da Lixeira usa
// esse valor como autor das exclusões feitas com a chave de serviço (que não
// tem auth.uid()). Só é honrado no banco com JWT service_role.
export function createAdminClient(usuarioId?: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada. Adicione em: Vercel → Settings → Environment Variables')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: cabecalhosDeAutoria(usuarioId) },
    }
  )
}
```

e acrescentar o import junto aos existentes no topo do arquivo: `import { cabecalhosDeAutoria } from '@/lib/lixeira'`.

- [ ] **Step 2: `getAuthenticatedAdmin` envia o usuário autenticado**

No mesmo arquivo, dentro de `getAuthenticatedAdmin`, trocar `return { user, supabase: createAdminClient() }` por `return { user, supabase: createAdminClient(user.id) }`.

- [ ] **Step 3: `tsc`, testes e build**

Run: `npx tsc --noEmit` (limpo), `npm test` (todos passam) e `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build` (compila).

- [ ] **Step 4: Verificação ponta a ponta da autoria (dev real)**

1. Criar um cliente descartável: Helper SQL → `Q "insert into clientes (nome, setores) values ('ZZLIX autoria', '{fiscal}') returning id"` e anotar o `id`.
2. Subir o app local (ver "Ambiente: rodar o app local"), `browser_login({ secret: 'ADMIN' })`, abrir `http://localhost:3000/fiscal/clientes/<id>`, clicar **Excluir**, digitar o nome exato `ZZLIX autoria` e `DELETAR`, confirmar.
3. Conferir: `Q "select tabela, origem_autor, excluido_por is not null as tem_autor from public.lixeira where dados->>'nome' = 'ZZLIX autoria'"`.
Expected: uma linha `clientes | servico | t` (a Server Action usa a chave de serviço e o header chegou ao trigger). Se vier `desconhecido | f`, o header não está chegando: investigar `createAdminClient(user.id)` antes de seguir (não avançar).
4. Limpar: `Q "delete from public.lixeira where dados->>'nome' = 'ZZLIX autoria'"`; parar o servidor e apagar o `.env.development.local` do worktree.

- [ ] **Step 5: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add lib/supabase/server.ts && git commit -m "feat(lixeira): client de servico envia o usuario autenticado para a autoria das exclusoes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Server Actions e proteção de rota

**Files:**
- Create: `lib/lixeira-actions.ts`
- Modify: `lib/rotas-admin.ts`
- Create: `tests/rotas-admin.test.ts`

**Interfaces:**
- Consumes: `agruparExclusoes`, `LinhaLixeira`, `ExclusaoAgrupada` (Task 3); `getAuthenticatedAdmin` com autoria (Task 4); RPCs `lixeira_listar`, `lixeira_restaurar`, `lixeira_limpar` (Task 2).
- Produces (Task 6): `listarExclusoes(): Promise<{ data: ExclusaoAgrupada[]; error: string | null }>`; `restaurarExclusao(grupo: number): Promise<{ error: string | null; resumo?: Record<string, number> }>`; `ehRotaAdmin('/admin/lixeira') === true`.

- [ ] **Step 1: Teste da rota admin (vai falhar)**

Criar `tests/rotas-admin.test.ts`:

```ts
// tests/rotas-admin.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehRotaAdmin } from '../lib/rotas-admin'

test('ehRotaAdmin: /admin/lixeira e subrotas exigem admin', () => {
  assert.equal(ehRotaAdmin('/admin/lixeira'), true)
  assert.equal(ehRotaAdmin('/admin/lixeira/qualquer'), true)
})

test('ehRotaAdmin: rotas admin que já existiam continuam exigindo admin', () => {
  assert.equal(ehRotaAdmin('/fiscal/parametros'), true)
  assert.equal(ehRotaAdmin('/vinculos'), true)
})

test('ehRotaAdmin: /admin/configuracoes continua fora (controlada por paginas_acesso)', () => {
  assert.equal(ehRotaAdmin('/admin/configuracoes'), false)
  assert.equal(ehRotaAdmin('/admin/configuracoes/fiscal'), false)
})

test('ehRotaAdmin: prefixo parecido não conta (lixeiras, lixeira-x)', () => {
  assert.equal(ehRotaAdmin('/admin/lixeiras'), false)
  assert.equal(ehRotaAdmin('/admin/lixeira-x'), false)
})
```

Run: `node --import tsx --test tests/rotas-admin.test.ts` → Expected: FAIL nos dois primeiros grupos (`/admin/lixeira` ainda não está na lista).

- [ ] **Step 2: Incluir a rota na lista**

Em `lib/rotas-admin.ts`, trocar `export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos'] as const` por `export const ROTAS_ADMIN = ['/fiscal/parametros', '/vinculos', '/admin/lixeira'] as const`.

Run: `node --import tsx --test tests/rotas-admin.test.ts` → Expected: PASS.

- [ ] **Step 3: Implementar as Server Actions**

Criar `lib/lixeira-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'
import { agruparExclusoes, type ExclusaoAgrupada, type LinhaLixeira } from '@/lib/lixeira'

// Lixeira é só para admin. Erro esperado volta como valor (doc do Next), não como throw.
async function exigirAdmin() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Não autorizado.' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Acesso negado.' as const }
  return { error: null, user, supabase }
}

export async function listarExclusoes(): Promise<{ data: ExclusaoAgrupada[]; error: string | null }> {
  const ctx = await exigirAdmin()
  if (ctx.error !== null) return { data: [], error: ctx.error }

  // Limpeza best-effort do que expirou (60 dias); falha aqui não impede a listagem.
  await ctx.supabase.rpc('lixeira_limpar')

  // A função SQL devolve só "campos" para o título; o conteúdo (content_base64) nunca trafega.
  const { data, error } = await ctx.supabase.rpc('lixeira_listar', { p_limite: 3000 })
  if (error) return { data: [], error: error.message }
  const linhas = (data ?? []) as LinhaLixeira[]

  const ids = Array.from(new Set(linhas.map(l => l.excluido_por).filter((x): x is string => !!x)))
  const nomes: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: perfis } = await ctx.supabase.from('profiles').select('id, nome').in('id', ids)
    for (const p of perfis ?? []) nomes[p.id as string] = (p.nome as string) ?? ''
  }

  return { data: agruparExclusoes(linhas, new Date(), nomes).slice(0, 200), error: null }
}

const ROTAS_A_ATUALIZAR = [
  '/admin/lixeira', '/clientes', '/fiscal/clientes', '/contabil/clientes', '/pessoal/clientes',
  '/societario/clientes', '/financeiro/clientes', '/fiscal/parcelamentos',
]

export async function restaurarExclusao(
  grupo: number,
): Promise<{ error: string | null; resumo?: Record<string, number> }> {
  const ctx = await exigirAdmin()
  if (ctx.error !== null) return { error: ctx.error }
  if (!Number.isSafeInteger(grupo) || grupo <= 0) return { error: 'Exclusão inválida.' }

  const { data, error } = await ctx.supabase.rpc('lixeira_restaurar', { p_grupo: grupo, p_usuario: ctx.user.id })
  if (error) return { error: error.message }

  for (const rota of ROTAS_A_ATUALIZAR) revalidatePath(rota)
  const resumo = (data as { restaurado?: Record<string, number> } | null)?.restaurado
  return { error: null, resumo }
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` (limpo) e `npm test` (todos passam).
Verificação funcional direta das RPCs (o app ainda não tem UI): Helper SQL → criar `ZZLIX acao`, apagar, e `Q "select count(*) from public.lixeira_listar(50) where campos->>'nome' = 'ZZLIX acao'"` = 1. Limpar o que criou (`delete from lixeira where dados->>'nome' = 'ZZLIX acao'`).

- [ ] **Step 5: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add lib/lixeira-actions.ts lib/rotas-admin.ts tests/rotas-admin.test.ts && git commit -m "feat(lixeira): Server Actions listar/restaurar (admin) e rota /admin/lixeira protegida no proxy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tela "Lixeira", link no menu e aviso no modal da #184

**Files:**
- Create: `app/admin/lixeira/page.tsx`
- Create: `app/admin/lixeira/LixeiraClient.tsx`
- Modify: `components/fiscal/Sidebar.tsx`
- Modify: `lib/exclusao-cliente.ts`, `tests/exclusao-cliente.test.ts`, `components/geral/ConfirmarExclusaoClienteModal.tsx`

**Interfaces:**
- Consumes: `listarExclusoes`, `restaurarExclusao` (Task 5); `ExclusaoAgrupada` (Task 3).
- Produces: rota `/admin/lixeira`; constante `AVISO_RESTAURACAO` em `lib/exclusao-cliente.ts`.

- [ ] **Step 1: Teste do aviso de restauração (vai falhar)**

Em `tests/exclusao-cliente.test.ts`, acrescentar `AVISO_RESTAURACAO,` à lista de imports de `'../lib/exclusao-cliente'` e, no fim do arquivo:

```ts
// ---------- AVISO_RESTAURACAO ----------

test('AVISO_RESTAURACAO: diz que só administrador restaura e por quanto tempo (60 dias)', () => {
  assert.match(AVISO_RESTAURACAO, /administrador/)
  assert.match(AVISO_RESTAURACAO, /60 dias/)
  assert.match(AVISO_RESTAURACAO, /Lixeira/)
})
```

Run: `node --import tsx --test tests/exclusao-cliente.test.ts` → Expected: FAIL (`AVISO_RESTAURACAO` indefinido).

- [ ] **Step 2: Implementar a constante e usá-la no modal**

Ao final de `lib/exclusao-cliente.ts` acrescentar:

```ts
// A exclusão passa a ser recuperável (Lixeira, 60 dias), mas só por um admin:
// o alerta continua forte de propósito, porque funciona como freio.
export const AVISO_RESTAURACAO =
  'Você não consegue desfazer isto sozinho: só um administrador pode restaurar, pela Lixeira, por até 60 dias.'
```

Em `components/geral/ConfirmarExclusaoClienteModal.tsx`: importar `AVISO_RESTAURACAO` (`import { confirmacaoExclusaoValida, AVISO_RESTAURACAO, type ImpactoExclusao } from '@/lib/exclusao-cliente'`) e trocar o texto fixo `Esta ação não pode ser desfeita.{' '}` por `{AVISO_RESTAURACAO}{' '}`.

Run: `node --import tsx --test tests/exclusao-cliente.test.ts` → Expected: PASS.

- [ ] **Step 3: Página do servidor**

Criar `app/admin/lixeira/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listarExclusoes } from '@/lib/lixeira-actions'
import LixeiraClient from './LixeiraClient'

export const metadata = { title: 'Lixeira — Tesserato' }

export default async function LixeiraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/intranet')

  const { data, error } = await listarExclusoes()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <LixeiraClient exclusoesIniciais={data} erroInicial={error} />
    </div>
  )
}
```

- [ ] **Step 4: Componente cliente**

Criar `app/admin/lixeira/LixeiraClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { restaurarExclusao } from '@/lib/lixeira-actions'
import type { ExclusaoAgrupada } from '@/lib/lixeira'

interface Props {
  exclusoesIniciais: ExclusaoAgrupada[]
  erroInicial: string | null
}

const ORIGEM_TEXTO: Record<ExclusaoAgrupada['origemAutor'], string> = {
  sessao: 'pela sessão do usuário',
  servico: 'pelo sistema',
  desconhecido: 'autor desconhecido',
}

// Fuso fixo para servidor e navegador renderizarem igual (evita erro de hidratação).
function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export default function LixeiraClient({ exclusoesIniciais, erroInicial }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [restaurando, setRestaurando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(erroInicial)
  const [aviso, setAviso] = useState<string | null>(null)

  async function restaurar(grupo: number) {
    setRestaurando(grupo)
    setErro(null)
    setAviso(null)
    const r = await restaurarExclusao(grupo)
    setRestaurando(null)
    if (r.error) { setErro(r.error); return }
    setConfirmando(null)
    setAviso('Exclusão restaurada.')
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-[var(--fg)] font-bold text-xl mb-1">Lixeira</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-6">
        Tudo o que é apagado do sistema fica aqui por 60 dias. Restaurar devolve a exclusão inteira
        (por exemplo, um cliente com as tarefas e anexos que foram junto).
      </p>

      {erro && <p className="mb-4 text-red-400 text-sm">{erro}</p>}
      {aviso && <p className="mb-4 text-emerald-400 text-sm">{aviso}</p>}

      {exclusoesIniciais.length === 0 && !erro && (
        <p className="text-[var(--fg)]/40 text-sm">Nenhuma exclusão guardada.</p>
      )}

      <ul className="space-y-3">
        {exclusoesIniciais.map(e => (
          <li key={e.grupo} className="rounded-xl border border-[var(--fg)]/10 bg-[var(--fg)]/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[var(--fg)] font-semibold text-sm truncate">{e.titulo}</p>
                <p className="text-[var(--fg)]/60 text-xs mt-0.5">{e.resumo}</p>
                <p className="text-[var(--fg)]/40 text-xs mt-1">
                  Apagado em <span suppressHydrationWarning>{formatarData(e.excluidoEm)}</span>
                  {' · '}
                  {e.excluidoPorNome ? `por ${e.excluidoPorNome}` : ORIGEM_TEXTO[e.origemAutor]}
                  {' · '}
                  {e.restaurada ? 'já restaurada' : `expira em ${e.diasRestantes} dia${e.diasRestantes === 1 ? '' : 's'}`}
                </p>
              </div>

              {!e.restaurada && (
                confirmando === e.grupo ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => restaurar(e.grupo)}
                      disabled={restaurando === e.grupo}
                      className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
                      {restaurando === e.grupo ? 'Restaurando...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmando(null)}
                      disabled={restaurando === e.grupo}
                      className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-2 py-1.5 disabled:opacity-40">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setErro(null); setAviso(null); setConfirmando(e.grupo) }}
                    className="shrink-0 text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
                    Restaurar
                  </button>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Link no menu Admin**

Em `components/fiscal/Sidebar.tsx`, no import de `lucide-react`, acrescentar `Trash2` (por exemplo: trocar `Sun, Moon, Link2, ListChecks, Building2, UserCheck,` por `Sun, Moon, Link2, ListChecks, Building2, UserCheck, Trash2,`) e, dentro do bloco `profile.role === 'admin'`, logo depois da linha do `NavLink` de "Vínculos", acrescentar:

```tsx
                <NavLink item={{ href: '/admin/lixeira', label: 'Lixeira', icon: Trash2 }} active={pathname.startsWith('/admin/lixeira')} />
```

- [ ] **Step 6: Verificações estáticas**

Run: `npx tsc --noEmit` (limpo); `npx eslint app/admin/lixeira components/fiscal/Sidebar.tsx components/geral/ConfirmarExclusaoClienteModal.tsx lib/lixeira.ts lib/lixeira-actions.ts lib/exclusao-cliente.ts` (sem erros; avisos pré-existentes em outros arquivos não contam); `npm test` (todos passam); `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build` (compila e lista `/admin/lixeira`).

- [ ] **Step 7: Verificação ponta a ponta no navegador (dev real)**

1. Criar dois clientes descartáveis com filhos: `ZZLIX tela` (`{contabil}`, com `clientes_contabil` e 2 tarefas `contabil`) e anotar os ids. Guardar um instantâneo do original: `Q "select count(*) from tarefas where cliente_id='<id>'"` = 2.
2. Subir o app local; `browser_login({ secret: 'ADMIN' })`; abrir `/contabil/clientes/<id>`; **Excluir** → modal deve mostrar o texto com "só um administrador pode restaurar, pela Lixeira, por até 60 dias"; digitar nome e `DELETAR`; confirmar.
3. Abrir `http://localhost:3000/admin/lixeira`. Expected: uma entrada `ZZLIX tela`, resumo `1 cliente, 1 ficha do Contábil, 2 tarefas`, "por Admin Dev", "expira em 60 dias". O menu Admin mostra "Lixeira".
4. Clicar **Restaurar → Confirmar**. Expected: aviso "Exclusão restaurada." e a entrada passa a "já restaurada". Conferir no banco: `Q "select (select count(*) from clientes where id='<id>') as cli, (select count(*) from tarefas where cliente_id='<id>') as tar"` → `1 | 2`.
5. Tentar restaurar de novo (recarregar e o botão não deve aparecer, pois está restaurada). Forçar conflito: apagar de novo pela UI e, antes de restaurar, `Q "insert into clientes (id, nome, setores) values ('<id>', 'ocupou', '{}')"`; restaurar deve mostrar o erro "já existe um registro igual" **e nada muda**. Limpar (`delete from clientes where id='<id>'`).
6. `browser_login({ secret: 'FISCAL' })` (usuário comum): abrir `/admin/lixeira` deve redirecionar para `/intranet`, e o menu Admin não deve exibir "Lixeira".
7. Limpar todo dado de teste: `delete from clientes where nome like 'ZZLIX%'; delete from lixeira where dados->>'nome' like 'ZZLIX%'` (e as linhas filhas de mesmo grupo: `delete from lixeira where grupo in (select grupo from lixeira where dados->>'nome' like 'ZZLIX%')` antes). Parar o servidor e apagar o `.env.development.local` do worktree. Conferir `Q "select count(*) from lixeira"` = 0 e nenhum `ZZLIX` em `clientes`.

- [ ] **Step 8: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git add app/admin/lixeira components/fiscal/Sidebar.tsx lib/exclusao-cliente.ts tests/exclusao-cliente.test.ts components/geral/ConfirmarExclusaoClienteModal.tsx && git commit -m "feat(lixeira): tela de admin, link no menu e aviso de restauracao no modal de exclusao

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação final e fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-lixeira-exclusoes-design.md` (apenas se algo divergiu do plano)

**Interfaces:**
- Consumes: todas as tarefas anteriores.

- [ ] **Step 1: Suíte completa e checagens estáticas**

Run: `npm test` (todos passam, anotar o total), `npx tsc --noEmit` (limpo), `npx eslint lib app components tests` **apenas para arquivos tocados por esta branch** (`git diff --name-only origin/dev...HEAD`); `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build` (compila).

- [ ] **Step 2: Reexecutar todos os testes SQL contra o dev**

Helper SQL: `F "$w\supabase\tests\055_lixeira_captura.sql"`, `F "$w\supabase\tests\055_lixeira_restauracao.sql"`, `F "$w\supabase\tests\055_lixeira_smoke.sql"`. Expected: `[exit=0]` nos três, com `TUDO OK: 055 captura`, `TUDO OK: 055 restauracao` e `055 OK`.

- [ ] **Step 3: Ciclo de rollback**

`F "$w\supabase\rollback\055_rollback.sql"` (`[exit=0]`) → smoke deve falhar (`[exit=3]`) → `F "$w\supabase\migrations\055_lixeira.sql"` (`[exit=0]`) → smoke `055 OK`. Conferir que o dev termina **com a 055 aplicada**.

- [ ] **Step 4: Sem resíduo e sem segredo**

`Q "select (select count(*) from lixeira) as lixeira, (select count(*) from clientes where nome like 'ZZ%') as clientes_zz"` → `0 | 0`. `git status --short` limpo; `git ls-files | grep -i "\.env"` não lista nada; `.env.development.local` não existe no worktree.

- [ ] **Step 5: Push (sem merge) e relatório**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/wt-exclusao-cliente" && git push origin feat/exclusao-cliente-confirmacao
```

O controlador (não o subagente) atualiza o corpo da PR #184 com esta entrega e o relatório de testes, e **não** faz merge.

---

## Self-Review (feita ao escrever o plano)

- **Cobertura da spec:** §4.1 (tabela) e §4.2 (18 tabelas) → Task 1; §5.1–5.2 (captura, autoria) → Tasks 1 e 4; §6.1 (restauração, ordem, reinclusão do setor, tudo-ou-nada) → Task 2; §7 (limpeza, pg_cron opcional) → Task 2; §8 (`lixeira_listar`, actions, página, header, ajuste do modal) → Tasks 2, 4, 5, 6; §9 (segurança) → Tasks 1 e 2 (RLS, grants, search_path); §10 (testes) → todas; §11 (implantação) → só dev, Task 7.
- **Placeholders:** nenhum "TBD"/"TODO"; todos os passos de código trazem o código.
- **Consistência de tipos/nomes:** `cabecalhosDeAutoria`, `agruparExclusoes(linhas, agora, nomesPorId)`, `LinhaLixeira.campos`, `ExclusaoAgrupada.excluidoPorNome`, `lixeira_restaurar(bigint, uuid)`, `lixeira_listar(integer)`, `lixeira_limpar()` são usados com a mesma assinatura em todas as tarefas.
- **SQL validado antes de a execução começar (2026-09-29):** os blocos SQL deste plano foram extraídos e rodados no dev numa **única transação desfeita** (nada persistiu): migration completa (partes 1+2) + 8 testes de captura + 13 de restauração + smoke + rollback, todos `OK`, `exit=0`. Isso pegou dois defeitos que já estão corrigidos aqui: `\g /dev/null` não funciona no psql do Windows (trocado por `as zz \gset`), e testes na mesma transação caem no mesmo grupo (por isso R3–R6 renumeram o grupo). Fato descoberto no caminho: `tarefas.parcelamento_id → parcelamentos` é `ON DELETE CASCADE`, então apagar um parcelamento leva as tarefas dele (a ordem de restauração já trata isso). O que **não** foi ensaiado a seco: o código TypeScript e a interface (cobertos pelos testes e pela verificação em navegador das Tasks 3–7).
- **Riscos conhecidos aceitos:** "Remover do setor" gera **duas** entradas na Lixeira (uma por chamada ao banco: tarefas do setor e ficha do setor), pois cada chamada é uma transação; ambas podem ser restauradas em qualquer ordem. Vínculos apenas anulados (`SET NULL`) não são religados.
