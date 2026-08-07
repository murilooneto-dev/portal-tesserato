-- supabase/migrations/022_parcelamento_tarefa_automatica.sql

begin;

-- Setores em que o parcelamento gera tarefa na ficha do cliente (spec
-- 2026-08-07, item 1). Só Fiscal e Pessoal de fato geram tarefa nesta
-- entrega — Contábil fica disponível no cadastro sem efeito ainda.
alter table parcelamentos add column if not exists setores text[] not null default '{}';

-- Liga uma tarefa à parcelamento que a originou. Nullable: tarefas normais
-- (não geradas por parcelamento) continuam com esse campo null. Cascade:
-- apagar o parcelamento apaga as tarefas que ele gerou (spec item 2).
alter table tarefas add column if not exists parcelamento_id uuid references parcelamentos(id) on delete cascade;

create index if not exists idx_tarefas_parcelamento_id on tarefas (parcelamento_id);

commit;
