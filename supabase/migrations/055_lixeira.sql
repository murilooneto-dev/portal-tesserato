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
