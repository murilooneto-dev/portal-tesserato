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
