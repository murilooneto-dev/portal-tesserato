-- supabase/migrations/047_planilhas.sql
--
-- Tabelas de planilha: o usuário envia um .xlsx/.csv e o sistema cria uma
-- tabela viva editável por setor. Linhas em JSONB (chave = id da coluna, não
-- o nome, então renomear coluna não quebra dado). Escrita via Server Actions
-- com service role; RLS só libera leitura por setor (e tudo pro admin).

create table planilhas (
  id           uuid primary key default gen_random_uuid(),
  setor        text not null check (setor in ('fiscal','contabil','pessoal','societario','financeiro')),
  nome         text not null,
  coluna_chave uuid,
  criado_por   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index planilhas_setor_idx on planilhas (setor);

create table planilha_colunas (
  id          uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references planilhas(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('texto','numero','data','opcoes','cliente')),
  ordem       int  not null,
  opcoes      jsonb
);
create index planilha_colunas_ordem_idx on planilha_colunas (planilha_id, ordem);

create table planilha_linhas (
  id          uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references planilhas(id) on delete cascade,
  dados       jsonb not null default '{}'::jsonb,
  -- Excluir o cliente do sistema não apaga a linha da planilha: ela vira
  -- "sem cliente".
  cliente_id  uuid references clientes(id) on delete set null,
  ordem       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index planilha_linhas_ordem_idx on planilha_linhas (planilha_id, ordem);
create index planilha_linhas_cliente_idx on planilha_linhas (cliente_id);

alter table planilhas        enable row level security;
alter table planilha_colunas enable row level security;
alter table planilha_linhas  enable row level security;

create policy "Setor le planilhas" on planilhas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and planilhas.setor::user_setor = any(p.setores)
  )
);
create policy "Admin gerencia planilhas" on planilhas for all using (is_admin());

-- A RLS de planilhas já se aplica dentro do exists, então herdamos o filtro
-- por setor sem repetir a regra.
create policy "Setor le planilha_colunas" on planilha_colunas for select using (
  exists (select 1 from planilhas pl where pl.id = planilha_colunas.planilha_id)
);
create policy "Admin gerencia planilha_colunas" on planilha_colunas for all using (is_admin());

create policy "Setor le planilha_linhas" on planilha_linhas for select using (
  exists (select 1 from planilhas pl where pl.id = planilha_linhas.planilha_id)
);
create policy "Admin gerencia planilha_linhas" on planilha_linhas for all using (is_admin());

-- Criação atômica (uma função = uma transação): ou grava planilha, colunas e
-- linhas, ou não grava nada. Só o service role chama (a Server Action já
-- validou permissão e payload).
create or replace function criar_planilha(
  p_setor text,
  p_nome text,
  p_criado_por uuid,
  p_coluna_chave uuid,
  p_colunas jsonb,
  p_linhas jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into planilhas (setor, nome, criado_por, coluna_chave)
  values (p_setor, p_nome, p_criado_por, p_coluna_chave)
  returning id into v_id;

  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes)
  select (c->>'id')::uuid, v_id, c->>'nome', c->>'tipo', (c->>'ordem')::int,
         nullif(c->'opcoes', 'null'::jsonb)
  from jsonb_array_elements(p_colunas) c;

  insert into planilha_linhas (planilha_id, dados, cliente_id, ordem)
  select v_id, l->'dados', nullif(l->>'clienteId', '')::uuid, (l->>'ordem')::int
  from jsonb_array_elements(p_linhas) l;

  return v_id;
end;
$$;

revoke all on function criar_planilha(text, text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function criar_planilha(text, text, uuid, uuid, jsonb, jsonb) to service_role;
