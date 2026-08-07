-- supabase/migrations/023_fix_legacy_tarefas_unique_constraint.sql

begin;

-- Migration 006 tentou derrubar a constraint unique original de `tarefas`
-- (criada implicitamente por `unique (cliente_id, mes, ano, tipo)` em
-- 001_initial.sql, cujo nome auto-gerado pelo Postgres é
-- `tarefas_cliente_id_mes_ano_tipo_key`) antes de criar a nova constraint
-- com `setor`. Só que o nome usado no DROP tinha um erro de digitação
-- (faltava "_id"): `tarefas_cliente_mes_ano_tipo_key`. Como o DROP usava
-- "if exists", o erro de nome não gerou falha — só silenciosamente não fez
-- nada, e a constraint antiga (sem `setor`) ficou viva desde então.
--
-- Isso ficou invisível até a tarefa automática de parcelamento (2026-08-07):
-- é a primeira feature que precisa da MESMA `tipo` (ex: "Parcelamentos
-- (SEFAZ - PARCELAMENTOS)") para o mesmo cliente/mes/ano em DOIS setores
-- diferentes (Fiscal e Pessoal) simultaneamente — cenário que a constraint
-- antiga (sem `setor` na chave) bloqueia com "duplicate key value violates
-- unique constraint", mesmo a constraint nova (com `setor`) permitindo.
alter table tarefas drop constraint if exists tarefas_cliente_id_mes_ano_tipo_key;

commit;
