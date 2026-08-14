-- supabase/migrations/025_tarefa_tipo_vinculos.sql

-- Vínculo entre um tipo de tarefa do catálogo (tarefa_tipos) e uma entidade
-- de Regime, Grupo ou Atividade. entidade_id referencia regimes.id/
-- grupos.id/atividades.id conforme entidade_tipo — sem FK direta pra cada
-- uma (não dá pra ter 3 FKs opcionais limpas em Postgres pra uma coluna só);
-- a integridade é garantida na aplicação (lib/tarefa-tipo-vinculos-
-- actions.ts), mesmo padrão de tarefa_tipos.setor sendo comparado a
-- user_setor sem FK formal.
create table tarefa_tipo_vinculos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_tipo_id uuid not null references tarefa_tipos(id) on delete cascade,
  entidade_tipo  text not null check (entidade_tipo in ('regime', 'grupo', 'atividade')),
  entidade_id    uuid not null,
  unique (tarefa_tipo_id, entidade_tipo, entidade_id)
);

create index idx_tarefa_tipo_vinculos_entidade on tarefa_tipo_vinculos (entidade_tipo, entidade_id);

alter table tarefa_tipo_vinculos enable row level security;

create policy "Autenticados leem tarefa_tipo_vinculos" on tarefa_tipo_vinculos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_tipo_vinculos" on tarefa_tipo_vinculos for all using (is_admin());
