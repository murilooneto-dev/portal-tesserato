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

commit;
