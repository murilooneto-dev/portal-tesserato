-- supabase/migrations/009_tarefa_vinculos.sql

-- ============================================================
-- Vínculos de tarefas entre setores: catálogo administrável de
-- pares (setor+tipo de origem -> setor+tipo de destino) e a
-- lista de vínculos ativos por cliente. Texto livre nos dois
-- lados (não FK pra tarefa_tipos) porque o Fiscal não tem
-- catálogo de tipos — nomes de tarefa são texto livre lá.
-- Ver docs/superpowers/specs/2026-07-16-vinculos-tarefas-entre-setores-design.md
-- ============================================================

create table tarefa_vinculos (
  id             uuid primary key default gen_random_uuid(),
  setor_origem   user_setor not null,
  tipo_origem    text not null,
  setor_destino  user_setor not null,
  tipo_destino   text not null,
  created_at     timestamptz not null default now()
);

alter table tarefa_vinculos enable row level security;

create policy "Autenticados leem tarefa_vinculos" on tarefa_vinculos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_vinculos" on tarefa_vinculos for all using (is_admin());

alter table clientes add column tarefas_vinculadas_ativas uuid[] not null default '{}';
